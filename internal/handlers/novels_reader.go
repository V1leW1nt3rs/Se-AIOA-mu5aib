package handlers

import (
    "archive/zip"
    "encoding/xml"
    "errors"
    "html"
    "io"
    "net/http"
    "path"
    "path/filepath"
    "regexp"
    "strconv"
    "strings"

    "github.com/labstack/echo/v4"
)

type (
    NovelChapter struct {
        Href   string `json:"href"`
        Title  string `json:"title"`
        Number int    `json:"number"`
    }

    NovelChapterContent struct {
        Title      string   `json:"title"`
        Paragraphs []string `json:"paragraphs"`
    }

    novelEpubContainer struct {
        Rootfiles []struct {
            FullPath string `xml:"full-path,attr"`
        } `xml:"rootfiles>rootfile"`
    }

    novelEpubPackage struct {
        Manifest []struct {
            ID   string `xml:"id,attr"`
            Href string `xml:"href,attr"`
        } `xml:"manifest>item"`
        Spine []struct {
            IDRef string `xml:"idref,attr"`
        } `xml:"spine>itemref"`
    }
)

var (
    novelTitleRegex      = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
    novelParaRegex       = regexp.MustCompile(`(?is)<p(?:\s[^>]*)?>(.*?)</p>`)
    novelTagRegex        = regexp.MustCompile(`(?s)<[^>]*>`)
    novelChapterNumRegex = regexp.MustCompile(`(?i)chapter\s+(\d+)`)
)

func (h *Handler) novelEpubPath(name string) (string, error) {
    if name == "" || name != filepath.Base(name) || !strings.HasSuffix(strings.ToLower(name), ".epub") {
        return "", errors.New("invalid file name")
    }
    return filepath.Join(h.App.Config.Data.AppDataDir, "Novels", name), nil
}

func novelReadZipFile(zr *zip.ReadCloser, name string) ([]byte, error) {
    for _, f := range zr.File {
        if f.Name == name {
            rc, err := f.Open()
            if err != nil {
                return nil, err
            }
            defer rc.Close()
            return io.ReadAll(rc)
        }
    }
    return nil, errors.New("file not found in epub: " + name)
}

// novelOpenEpub opens an epub and returns the zip, the folder of the package file, and the parsed package.
func novelOpenEpub(p string) (*zip.ReadCloser, string, *novelEpubPackage, error) {
    zr, err := zip.OpenReader(p)
    if err != nil {
        return nil, "", nil, err
    }

    containerData, err := novelReadZipFile(zr, "META-INF/container.xml")
    if err != nil {
        zr.Close()
        return nil, "", nil, err
    }
    var container novelEpubContainer
    if err := xml.Unmarshal(containerData, &container); err != nil || len(container.Rootfiles) == 0 {
        zr.Close()
        return nil, "", nil, errors.New("invalid epub container")
    }

    opfPath := container.Rootfiles[0].FullPath
    opfData, err := novelReadZipFile(zr, opfPath)
    if err != nil {
        zr.Close()
        return nil, "", nil, err
    }
    var pkg novelEpubPackage
    if err := xml.Unmarshal(opfData, &pkg); err != nil {
        zr.Close()
        return nil, "", nil, err
    }

    return zr, path.Dir(opfPath), &pkg, nil
}

// HandleGetNovelChapters
//
//@summary returns the chapters of one epub file in reading order.
//@route /api/v1/novels/chapters [GET]
//@returns []handlers.NovelChapter
func (h *Handler) HandleGetNovelChapters(c echo.Context) error {
    p, err := h.novelEpubPath(c.QueryParam("file"))
    if err != nil {
        return h.RespondWithStatusError(c, http.StatusBadRequest, err)
    }

    zr, base, pkg, err := novelOpenEpub(p)
    if err != nil {
        return h.RespondWithError(c, err)
    }
    defer zr.Close()

    hrefByID := map[string]string{}
    for _, it := range pkg.Manifest {
        hrefByID[it.ID] = it.Href
    }

    ids := make([]string, 0, len(pkg.Spine))
    for _, ref := range pkg.Spine {
        ids = append(ids, ref.IDRef)
    }
    if len(ids) == 0 {
        for _, it := range pkg.Manifest {
            ids = append(ids, it.ID)
        }
    }

    chapters := make([]*NovelChapter, 0, len(ids))
    for _, id := range ids {
        href, ok := hrefByID[id]
        if !ok {
            continue
        }
        lower := strings.ToLower(href)
        if !(strings.HasSuffix(lower, ".xhtml") || strings.HasSuffix(lower, ".html") || strings.HasSuffix(lower, ".htm")) {
            continue
        }
        if path.Base(lower) == "nav.xhtml" {
            continue
        }

        title := href
        if data, err := novelReadZipFile(zr, path.Join(base, href)); err == nil {
            if m := novelTitleRegex.FindSubmatch(data); m != nil {
                title = strings.TrimSpace(html.UnescapeString(string(m[1])))
            }
        }

        number := 0
        if m := novelChapterNumRegex.FindStringSubmatch(title); m != nil {
            number, _ = strconv.Atoi(m[1])
        }

        chapters = append(chapters, &NovelChapter{Href: href, Title: title, Number: number})
    }

    return h.RespondWithData(c, chapters)
}

// HandleGetNovelChapter
//
//@summary returns the text of one chapter as plain paragraphs.
//@route /api/v1/novels/chapter [GET]
//@returns handlers.NovelChapterContent
func (h *Handler) HandleGetNovelChapter(c echo.Context) error {
    p, err := h.novelEpubPath(c.QueryParam("file"))
    if err != nil {
        return h.RespondWithStatusError(c, http.StatusBadRequest, err)
    }

    href := c.QueryParam("href")
    if href == "" {
        return h.RespondWithStatusError(c, http.StatusBadRequest, errors.New("missing chapter"))
    }

    zr, base, pkg, err := novelOpenEpub(p)
    if err != nil {
        return h.RespondWithError(c, err)
    }
    defer zr.Close()

    allowed := false
    for _, it := range pkg.Manifest {
        if it.Href == href {
            allowed = true
            break
        }
    }
    if !allowed {
        return h.RespondWithStatusError(c, http.StatusBadRequest, errors.New("invalid chapter"))
    }

    data, err := novelReadZipFile(zr, path.Join(base, href))
    if err != nil {
        return h.RespondWithError(c, err)
    }
    raw := string(data)

    title := ""
    if m := novelTitleRegex.FindStringSubmatch(raw); m != nil {
        title = strings.TrimSpace(html.UnescapeString(m[1]))
    }

    if i := strings.Index(strings.ToLower(raw), "<body"); i >= 0 {
        raw = raw[i:]
    }

    paragraphs := []string{}
    for _, m := range novelParaRegex.FindAllStringSubmatch(raw, -1) {
        text := novelTagRegex.ReplaceAllString(m[1], "")
        text = html.UnescapeString(text)
        text = strings.TrimSpace(strings.ReplaceAll(text, "\r", ""))
        if text != "" {
            paragraphs = append(paragraphs, text)
        }
    }

    return h.RespondWithData(c, &NovelChapterContent{Title: title, Paragraphs: paragraphs})
}