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

export function useGetNovelLibrary() {
    return useServerQuery<NovelSeries[]>({
        endpoint: "/api/v1/novels/library",
        method: "GET",
        queryKey: ["NOVELS-get-library"],
        enabled: true,
    })
}