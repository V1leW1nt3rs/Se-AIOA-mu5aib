import { useGetNovelChapter, useGetNovelChapters, useGetNovelLibrary } from "@/api/hooks/novels.hooks"
import React, { useEffect, useRef, useState } from "react"

type Pending = { edge: "first" | "last" } | { href: string } | null

const btn = "rounded-md border border-gray-700 px-3 py-1 text-sm hover:bg-gray-800 disabled:opacity-40"

function loadProgress(series: string): { file: string, href: string } | null {
    try {
        const raw = localStorage.getItem("novels-progress:" + series)
        return raw ? (JSON.parse(raw) as { file: string, href: string }) : null
    } catch {
        return null
    }
}

function saveProgress(series: string, file: string, href: string) {
    try {
        localStorage.setItem("novels-progress:" + series, JSON.stringify({ file, href }))
    } catch {
        // ignore
    }
}

export default function Page() {
    const { data: library, isLoading } = useGetNovelLibrary()

    const [seriesName, setSeriesName] = useState<string | null>(null)
    const [fileIdx, setFileIdx] = useState<number | null>(null)
    const [chapIdx, setChapIdx] = useState<number | null>(null)
    const [pending, setPending] = useState<Pending>(null)
    const [fontSize, setFontSize] = useState<number>(() => {
        try {
            const v = Number(localStorage.getItem("novels-font-size"))
            return v >= 12 && v <= 40 ? v : 18
        } catch {
            return 18
        }
    })
    const topRef = useRef<HTMLDivElement>(null)

    const series = library?.find(s => s.name === seriesName)
    const file = series && fileIdx !== null ? series.files[fileIdx]?.filename : undefined
    const { data: chapters } = useGetNovelChapters(file)
    const chapter = chapters && chapIdx !== null ? chapters[chapIdx] : undefined
    const { data: content, isLoading: contentLoading } = useGetNovelChapter(file, chapter?.href)

    // Once the chapter list of the target file has loaded, jump to the wanted chapter
    useEffect(() => {
        if (!pending || !chapters || chapters.length === 0) return
        if ("edge" in pending) {
            setChapIdx(pending.edge === "first" ? 0 : chapters.length - 1)
        } else {
            const i = chapters.findIndex(c => c.href === pending.href)
            setChapIdx(i >= 0 ? i : 0)
        }
        setPending(null)
    }, [pending, chapters])

    // Remember progress and scroll to the top when the chapter changes
    useEffect(() => {
        if (seriesName && file && chapter) saveProgress(seriesName, file, chapter.href)
        topRef.current?.scrollIntoView()
    }, [seriesName, file, chapter?.href])

    const goNext = () => {
        if (!series || fileIdx === null || chapIdx === null || !chapters) return
        if (chapIdx < chapters.length - 1) {
            setChapIdx(chapIdx + 1)
        } else if (fileIdx < series.files.length - 1) {
            setChapIdx(null)
            setPending({ edge: "first" })
            setFileIdx(fileIdx + 1)
        }
    }

    const goPrev = () => {
        if (!series || fileIdx === null || chapIdx === null || !chapters) return
        if (chapIdx > 0) {
            setChapIdx(chapIdx - 1)
        } else if (fileIdx > 0) {
            setChapIdx(null)
            setPending({ edge: "last" })
            setFileIdx(fileIdx - 1)
        }
    }

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight") goNext()
            if (e.key === "ArrowLeft") goPrev()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    })

    const changeFont = (delta: number) => {
        const next = Math.min(40, Math.max(12, fontSize + delta))
        setFontSize(next)
        try {
            localStorage.setItem("novels-font-size", String(next))
        } catch {
            // ignore
        }
    }

    const resume = () => {
        if (!series) return
        const p = loadProgress(series.name)
        if (!p) return
        const idx = series.files.findIndex(f => f.filename === p.file)
        if (idx < 0) return
        setPending({ href: p.href })
        setFileIdx(idx)
    }

    if (isLoading) return <div className="p-8 opacity-70">Loading...</div>

    // 1. Library: pick a series
    if (!series) {
        return (
            <div className="p-8 space-y-6">
                <h1 className="text-3xl font-bold">Novels</h1>

                {(!library || library.length === 0) && (
                    <p className="opacity-70">
                        No novels found. Put .epub files in the Novels folder inside your Seanime data folder.
                    </p>
                )}

                <div className="grid gap-4">
                    {library?.map(s => {
                        const starts = s.files.map(f => f.startChapter).filter(n => n > 0)
                        const ends = s.files.map(f => f.endChapter).filter(n => n > 0)
                        const range = starts.length > 0 ? " - Chapters " + Math.min(...starts) + " - " + Math.max(...ends) : ""
                        return (
                            <button
                                key={s.name}
                                className="rounded-lg border border-gray-800 p-4 text-left hover:bg-gray-900"
                                onClick={() => {
                                    setSeriesName(s.name)
                                    setFileIdx(null)
                                    setChapIdx(null)
                                }}
                            >
                                <div className="text-xl font-semibold">{s.name}</div>
                                <div className="text-sm opacity-70">{s.fileCount} files{range}</div>
                            </button>
                        )
                    })}
                </div>
            </div>
        )
    }

    // Loading while jumping between files
    if (pending) return <div className="p-8 opacity-70">Loading...</div>

    // 2. Series: pick a file
    if (fileIdx === null) {
        const progress = loadProgress(series.name)
        const canResume = !!progress && series.files.some(f => f.filename === progress.file)
        return (
            <div className="p-8 space-y-6">
                <div className="flex items-center gap-4">
                    <button className={btn} onClick={() => setSeriesName(null)}>Back</button>
                    <h1 className="text-3xl font-bold">{series.name}</h1>
                </div>

                {canResume && (
                    <button className={btn} onClick={resume}>Continue reading</button>
                )}

                <div className="grid gap-2">
                    {series.files.map((f, i) => (
                        <button
                            key={f.filename}
                            className="rounded-lg border border-gray-800 p-3 text-left hover:bg-gray-900"
                            onClick={() => {
                                setFileIdx(i)
                                setChapIdx(null)
                            }}
                        >
                            {f.startChapter > 0 ? "Chapters " + f.startChapter + " - " + f.endChapter : f.filename}
                        </button>
                    ))}
                </div>
            </div>
        )
    }

    // 3. File: pick a chapter
    if (chapIdx === null) {
        return (
            <div className="p-8 space-y-6">
                <div className="flex items-center gap-4">
                    <button className={btn} onClick={() => setFileIdx(null)}>Back</button>
                    <h1 className="text-2xl font-bold">{series.name}</h1>
                </div>

                {!chapters && <p className="opacity-70">Loading chapters...</p>}

                <div className="grid gap-2">
                    {chapters?.map((ch, i) => (
                        <button
                            key={ch.href}
                            className="rounded-lg border border-gray-800 p-3 text-left hover:bg-gray-900"
                            onClick={() => setChapIdx(i)}
                        >
                            {ch.title}
                        </button>
                    ))}
                </div>
            </div>
        )
    }

    // 4. Reader
    if (!chapter) return <div className="p-8 opacity-70">Loading...</div>

    const atStart = fileIdx === 0 && chapIdx === 0
    const atEnd = !!chapters && fileIdx === series.files.length - 1 && chapIdx === chapters.length - 1

    return (
        <div className="p-4 sm:p-8">
            <div ref={topRef} />
            <div className="mx-auto max-w-3xl">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <button className={btn} onClick={() => setChapIdx(null)}>Chapter list</button>
                    <div className="flex items-center gap-2">
                        <button className={btn} onClick={() => changeFont(-2)}>A-</button>
                        <span className="text-sm opacity-70">{fontSize}px</span>
                        <button className={btn} onClick={() => changeFont(2)}>A+</button>
                    </div>
                </div>

                <h1 className="mb-6 text-2xl font-bold">{content?.title || chapter.title}</h1>

                {contentLoading && <p className="opacity-70">Loading chapter...</p>}

                <div className="space-y-4" style={{ fontSize: fontSize, lineHeight: 1.8 }}>
                    {content?.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                </div>

                <div className="mt-8 flex justify-between">
                    <button className={btn} onClick={goPrev} disabled={atStart}>Previous</button>
                    <button className={btn} onClick={goNext} disabled={atEnd}>Next</button>
                </div>
            </div>
        </div>
    )
}