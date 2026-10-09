import { useGetNovelLibrary } from "@/api/hooks/novels.hooks"
import React from "react"

export default function Page() {
    const { data, isLoading } = useGetNovelLibrary()

    return (
        <div className="p-8 space-y-6">
            <h1 className="text-3xl font-bold">Novels</h1>

            {isLoading && <p className="opacity-70">Loading...</p>}

            {!isLoading && (!data || data.length === 0) && (
                <p className="opacity-70">
                    No novels found. Put .epub files in the Novels folder inside your Seanime data folder.
                </p>
            )}

            <div className="grid gap-4">
                {data?.map(series => {
                    const starts = series.files.map(f => f.startChapter).filter(n => n > 0)
                    const ends = series.files.map(f => f.endChapter).filter(n => n > 0)
                    const range = starts.length > 0
                        ? "Chapters " + Math.min(...starts) + " - " + Math.max(...ends)
                        : null

                    return (
                        <div key={series.name} className="rounded-lg border border-gray-800 p-4">
                            <div className="text-xl font-semibold">{series.name}</div>
                            <div className="text-sm opacity-70">
                                {series.fileCount} files{range ? " - " + range : ""}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}