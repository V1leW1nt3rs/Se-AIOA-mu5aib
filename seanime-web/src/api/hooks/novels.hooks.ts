import { useServerQuery } from "@/api/client/requests"

export type NovelFile = {
    filename: string
    startChapter: number
    endChapter: number
}

export type NovelSeries = {
    name: string
    fileCount: number
    files: NovelFile[]
}

export type NovelChapter = {
    href: string
    title: string
    number: number
}

export type NovelChapterContent = {
    title: string
    paragraphs: string[]
}

export function useGetNovelLibrary() {
    return useServerQuery<NovelSeries[]>({
        endpoint: "/api/v1/novels/library",
        method: "GET",
        queryKey: ["NOVELS-get-library"],
        enabled: true,
    })
}

export function useGetNovelChapters(file: string | undefined) {
    return useServerQuery<NovelChapter[]>({
        endpoint: "/api/v1/novels/chapters?file=" + encodeURIComponent(file ?? ""),
        method: "GET",
        queryKey: ["NOVELS-get-chapters", file],
        enabled: !!file,
    })
}

export function useGetNovelChapter(file: string | undefined, href: string | undefined) {
    return useServerQuery<NovelChapterContent>({
        endpoint: "/api/v1/novels/chapter?file=" + encodeURIComponent(file ?? "") + "&href=" + encodeURIComponent(href ?? ""),
        method: "GET",
        queryKey: ["NOVELS-get-chapter", file, href],
        enabled: !!file && !!href,
    })
}