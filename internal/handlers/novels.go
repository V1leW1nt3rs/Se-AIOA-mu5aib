package handlers

import (
    "os"
    "path/filepath"
    "regexp"
    "sort"
    "strconv"
    "strings"

    "github.com/labstack/echo/v4"
)

type (
    NovelFile struct {
        Filename     string `json:"filename"`
        StartChapter int    `json:"startChapter"`
        EndChapter   int    `json:"endChapter"`
    }

    NovelSeries struct {
        Name      string       `json:"name"`
        FileCount int          `json:"fileCount"`
        Files     []*NovelFile `json:"files"`
    }
)

// Matches names like "Shadow Slave Chapters 165 - 264.epub"
var novelFilenameRegex = regexp.MustCompile(`(?i)^(.*?)\s+chapters?\s+(\d+)\s*-\s*(\d+)\.epub$`)

// HandleGetNovelLibrary
//
//@summary scans the Novels folder in the data directory and groups .epub files into series.
//@route /api/v1/novels/library [GET]
//@returns []handlers.NovelSeries
func (h *Handler) HandleGetNovelLibrary(c echo.Context) error {
    dir := filepath.Join(h.App.Config.Data.AppDataDir, "Novels")

    entries, err := os.ReadDir(dir)
    if err != nil {
        if os.IsNotExist(err) {
            return h.RespondWithData(c, []*NovelSeries{})
        }
        return h.RespondWithError(c, err)
    }

    seriesByName := map[string]*NovelSeries{}
    for _, entry := range entries {
        if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".epub") {
            continue
        }

        file := &NovelFile{Filename: entry.Name()}
        seriesName := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))

        if m := novelFilenameRegex.FindStringSubmatch(entry.Name()); m != nil {
            seriesName = strings.TrimSpace(m[1])
            file.StartChapter, _ = strconv.Atoi(m[2])
            file.EndChapter, _ = strconv.Atoi(m[3])
        }

        s, ok := seriesByName[seriesName]
        if !ok {
            s = &NovelSeries{Name: seriesName, Files: []*NovelFile{}}
            seriesByName[seriesName] = s
        }
        s.Files = append(s.Files, file)
    }

    list := make([]*NovelSeries, 0, len(seriesByName))
    for _, s := range seriesByName {
        files := s.Files
        sort.Slice(files, func(i, j int) bool {
            a, b := files[i], files[j]
            if a.StartChapter != b.StartChapter {
                return a.StartChapter < b.StartChapter
            }
            if a.EndChapter != b.EndChapter {
                return a.EndChapter < b.EndChapter
            }
            return a.Filename < b.Filename
        })
        s.FileCount = len(files)
        list = append(list, s)
    }
    sort.Slice(list, func(i, j int) bool { return list[i].Name < list[j].Name })

    return h.RespondWithData(c, list)
}