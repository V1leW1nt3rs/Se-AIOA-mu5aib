import { useGetNovelChapter, useGetNovelChapters, useGetNovelLibrary } from "@/api/hooks/novels.hooks"
import React, { useEffect, useRef, useState } from "react"

type Pending = { edge: "first" | "last" } | { href: string } | null
type ThemeName = "dark" | "sepia" | "light"

const THEMES: Record<ThemeName, { bg: string, fg: string, hl: string }> = {
    dark: { bg: "#111114", fg: "#d6d6d6", hl: "rgba(255,255,255,0.14)" },
    sepia: { bg: "#f4ecd8", fg: "#4b3a28", hl: "rgba(120,80,20,0.22)" },
    light: { bg: "#ffffff", fg: "#1c1c1c", hl: "rgba(0,0,0,0.10)" },
}

const btn = "rounded-md border border-gray-700 px-3 py-1 text-sm hover:bg-gray-800 disabled:opacity-40"
const selectCls = "rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-white"

function loadSetting(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function saveSetting(key: string, value: string) {
    try {
        localStorage.setItem(key, value)
    } catch {
        // ignore
    }
}

function loadProgress(series: string): { file: string, href: string, ratio?: number } | null {
    try {
        const raw = localStorage.getItem("novels-progress:" + series)
        return raw ? (JSON.parse(raw) as { file: string, href: string, ratio?: number }) : null
    } catch {
        return null
    }
}

function saveProgress(series: string, file: string, href: string, ratio: number) {
    saveSetting("novels-progress:" + series, JSON.stringify({ file, href, ratio }))
}

// Finds the element that actually scrolls the page content
function getScroller(start: HTMLElement | null): HTMLElement {
    let node = start?.parentElement ?? null
    while (node) {
        const oy = getComputedStyle(node).overflowY
        if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node
        node = node.parentElement
    }
    return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

export default function Page() {
    const { data: library, isLoading } = useGetNovelLibrary()

    const [seriesName, setSeriesName] = useState<string | null>(null)
    const [fileIdx, setFileIdx] = useState<number | null>(null)
    const [chapIdx, setChapIdx] = useState<number | null>(null)
    const [pending, setPending] = useState<Pending>(null)

    const [theme, setTheme] = useState<ThemeName>(() => {
        const v = loadSetting("novels-theme")
        return v === "sepia" || v === "light" ? v : "dark"
    })
    const [fontFamily, setFontFamily] = useState<"sans" | "serif">(() => loadSetting("novels-font-family") === "serif" ? "serif" : "sans")
    const [fontSize, setFontSize] = useState<number>(() => {
        const v = Number(loadSetting("novels-font-size"))
        return v >= 12 && v <= 40 ? v : 18
    })
    const [ttsRate, setTtsRate] = useState<number>(() => {
        const v = Number(loadSetting("novels-tts-rate"))
        return v >= 0.5 && v <= 3 ? v : 1
    })
    const [voiceURI, setVoiceURI] = useState<string>(() => loadSetting("novels-tts-voice") ?? "")
    const [scrollSpeed, setScrollSpeed] = useState<number>(() => {
        const v = Number(loadSetting("novels-scroll-speed"))
        return v >= 10 && v <= 400 ? v : 60
    })
    const [showSettings, setShowSettings] = useState(false)
    const [ttsOn, setTtsOn] = useState(false)
    const [ttsIdx, setTtsIdx] = useState(0)
    const [autoScroll, setAutoScroll] = useState(false)
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

    const topRef = useRef<HTMLDivElement>(null)

    // These mirror state so speech callbacks never see stale values
    const ttsOnRef = useRef(false)
    const ttsRateRef = useRef(ttsRate)
    const voiceRef = useRef(voiceURI)
    const scrollSpeedRef = useRef(scrollSpeed)
    const paragraphsRef = useRef<string[]>([])
    const speakToken = useRef(0)
    const autoSpeakRef = useRef(false)
    const restoreRatioRef = useRef<number | null>(null)
    const goNextRef = useRef<() => void>(() => undefined)
    const canNextRef = useRef(false)

    const series = library?.find(s => s.name === seriesName)
    const file = series && fileIdx !== null ? series.files[fileIdx]?.filename : undefined
    const { data: chapters } = useGetNovelChapters(file)
    const chapter = chapters && chapIdx !== null ? chapters[chapIdx] : undefined
    const { data: content, isLoading: contentLoading } = useGetNovelChapter(file, chapter?.href)

    paragraphsRef.current = content?.paragraphs ?? []
    ttsRateRef.current = ttsRate
    voiceRef.current = voiceURI
    scrollSpeedRef.current = scrollSpeed

    const canNext = !!series && fileIdx !== null && chapIdx !== null && !!chapters &&
        (chapIdx < chapters.length - 1 || fileIdx < series.files.length - 1)
    const canPrev = fileIdx !== null && chapIdx !== null && (chapIdx > 0 || fileIdx > 0)
    canNextRef.current = canNext

    const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window
    const inReader = chapIdx !== null

    const stopTts = () => {
        speakToken.current++
        ttsOnRef.current = false
        setTtsOn(false)
        try {
            window.speechSynthesis.cancel()
        } catch {
            // ignore
        }
    }

    const speak = (idx: number) => {
        const synth = window.speechSynthesis
        const paras = paragraphsRef.current
        const token = ++speakToken.current
        synth.cancel()

        if (idx >= paras.length) {
            // Chapter finished: continue with the next one if there is one
            if (canNextRef.current) {
                autoSpeakRef.current = true
                goNextRef.current()
            } else {
                ttsOnRef.current = false
                setTtsOn(false)
            }
            return
        }

        ttsOnRef.current = true
        setTtsOn(true)
        setTtsIdx(idx)
        document.getElementById("novel-p-" + idx)?.scrollIntoView({ block: "center", behavior: "smooth" })

        const u = new SpeechSynthesisUtterance(paras[idx])
        u.rate = ttsRateRef.current
        const v = synth.getVoices().find(x => x.voiceURI === voiceRef.current)
        if (v) {
            u.voice = v
            u.lang = v.lang
        }
        u.onend = () => {
            if (token === speakToken.current && ttsOnRef.current) speak(idx + 1)
        }
        u.onerror = () => {
            if (token === speakToken.current) {
                ttsOnRef.current = false
                setTtsOn(false)
            }
        }
        window.setTimeout(() => {
            if (token === speakToken.current) synth.speak(u)
        }, 30)
    }

    const toggleTts = () => {
        if (ttsOn) {
            stopTts()
        } else if (content && content.paragraphs.length > 0) {
            speak(ttsIdx)
        }
    }

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
    goNextRef.current = goNext

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

    // Load the list of speech voices (browsers fill it in a moment after load)
    useEffect(() => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return
        const load = () => setVoices(window.speechSynthesis.getVoices())
        load()
        window.speechSynthesis.addEventListener("voiceschanged", load)
        return () => window.speechSynthesis.removeEventListener("voiceschanged", load)
    }, [])

    // Stop speaking when leaving the page
    useEffect(() => {
        return () => {
            speakToken.current++
            try {
                window.speechSynthesis.cancel()
            } catch {
                // ignore
            }
        }
    }, [])

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

    // When the chapter changes: remember it, go to the top, stop speech (unless it is continuing by itself)
    useEffect(() => {
        if (seriesName && file && chapter) saveProgress(seriesName, file, chapter.href, 0)
        setTtsIdx(0)
        if (!autoSpeakRef.current) stopTts()
        topRef.current?.scrollIntoView()
    }, [seriesName, file, chapter?.href])

    // Keep reading automatically after moving to the next chapter
    useEffect(() => {
        if (!autoSpeakRef.current || !content || content.paragraphs.length === 0) return
        autoSpeakRef.current = false
        speak(0)
    }, [content])

    // Restore the scroll position after "Continue reading"
    useEffect(() => {
        if (!content || restoreRatioRef.current === null) return
        const ratio = restoreRatioRef.current
        restoreRatioRef.current = null
        const t = window.setTimeout(() => {
            const el = getScroller(topRef.current)
            el.scrollTop = ratio * (el.scrollHeight - el.clientHeight)
        }, 200)
        return () => window.clearTimeout(t)
    }, [content])

    // Save the scroll position inside the chapter
    useEffect(() => {
        if (!seriesName || !file || !chapter) return
        let timer: number | undefined
        const onScroll = (e: Event) => {
            const target = e.target
            const el = target instanceof HTMLElement ? target : ((document.scrollingElement as HTMLElement | null) ?? document.documentElement)
            if (target instanceof HTMLElement && !target.contains(topRef.current)) return
            window.clearTimeout(timer)
            timer = window.setTimeout(() => {
                const max = el.scrollHeight - el.clientHeight
                saveProgress(seriesName, file, chapter.href, max > 0 ? el.scrollTop / max : 0)
            }, 400)
        }
        window.addEventListener("scroll", onScroll, true)
        return () => {
            window.clearTimeout(timer)
            window.removeEventListener("scroll", onScroll, true)
        }
    }, [seriesName, file, chapter?.href])

    // Auto-scroll
    useEffect(() => {
        if (!autoScroll || !inReader) return
        const el = getScroller(topRef.current)
        let raf = 0
        let last = performance.now()
        let acc = 0
        const tick = (now: number) => {
            acc += ((now - last) / 1000) * scrollSpeedRef.current
            last = now
            const whole = Math.floor(acc)
            if (whole > 0) {
                el.scrollTop += whole
                acc -= whole
            }
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
                setAutoScroll(false)
                return
            }
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        const stop = () => setAutoScroll(false)
        window.addEventListener("wheel", stop, { passive: true })
        window.addEventListener("touchmove", stop, { passive: true })
        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener("wheel", stop)
            window.removeEventListener("touchmove", stop)
        }
    }, [autoScroll, inReader])

    // Left/right arrow keys change chapter
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return
            if (e.key === "ArrowRight") goNext()
            if (e.key === "ArrowLeft") goPrev()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    })

    const changeFont = (delta: number) => {
        const next = Math.min(40, Math.max(12, fontSize + delta))
        setFontSize(next)
        saveSetting("novels-font-size", String(next))
    }

    const resume = () => {
        if (!series) return
        const p = loadProgress(series.name)
        if (!p) return
        const idx = series.files.findIndex(f => f.filename === p.file)
        if (idx < 0) return
        restoreRatioRef.current = typeof p.ratio === "number" ? p.ratio : null
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

    const t = THEMES[theme]
    const englishVoices = voices.filter(v => v.lang.toLowerCase().startsWith("en"))
    const voiceChoices = englishVoices.length > 0 ? englishVoices : voices

    return (
        <div className="p-4 sm:p-8">
            <div ref={topRef} />
            <div className="mx-auto max-w-3xl">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <button className={btn} onClick={() => setChapIdx(null)}>Chapter list</button>
                    {ttsSupported && (
                        <button className={btn + (ttsOn ? " bg-gray-800" : "")} onClick={toggleTts}>
                            {ttsOn ? "Pause" : "Listen"}
                        </button>
                    )}
                    <button className={btn + (autoScroll ? " bg-gray-800" : "")} onClick={() => setAutoScroll(!autoScroll)}>
                        {autoScroll ? "Stop scrolling" : "Auto-scroll"}
                    </button>
                    <button className={btn + (showSettings ? " bg-gray-800" : "")} onClick={() => setShowSettings(!showSettings)}>
                        Settings
                    </button>
                </div>

                {showSettings && (
                    <div className="mb-4 space-y-3 rounded-lg border border-gray-800 p-4 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="w-28 opacity-70">Theme</span>
                            {(["dark", "sepia", "light"] as ThemeName[]).map(n => (
                                <button
                                    key={n}
                                    className={btn + (theme === n ? " bg-gray-800" : "")}
                                    onClick={() => {
                                        setTheme(n)
                                        saveSetting("novels-theme", n)
                                    }}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="w-28 opacity-70">Font</span>
                            {(["sans", "serif"] as const).map(n => (
                                <button
                                    key={n}
                                    className={btn + (fontFamily === n ? " bg-gray-800" : "")}
                                    onClick={() => {
                                        setFontFamily(n)
                                        saveSetting("novels-font-family", n)
                                    }}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="w-28 opacity-70">Text size</span>
                            <button className={btn} onClick={() => changeFont(-2)}>A-</button>
                            <span className="opacity-70">{fontSize}px</span>
                            <button className={btn} onClick={() => changeFont(2)}>A+</button>
                        </div>
                        {ttsSupported && (
                            <>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="w-28 opacity-70">Voice</span>
                                    <select
                                        className={selectCls}
                                        value={voiceURI}
                                        onChange={e => {
                                            setVoiceURI(e.target.value)
                                            saveSetting("novels-tts-voice", e.target.value)
                                        }}
                                    >
                                        <option value="">Default voice</option>
                                        {voiceChoices.map(v => (
                                            <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="w-28 opacity-70">Speech speed</span>
                                    <select
                                        className={selectCls}
                                        value={String(ttsRate)}
                                        onChange={e => {
                                            setTtsRate(Number(e.target.value))
                                            saveSetting("novels-tts-rate", e.target.value)
                                        }}
                                    >
                                        {[0.75, 1, 1.25, 1.5, 1.75, 2].map(r => (
                                            <option key={r} value={String(r)}>{r}x</option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="w-28 opacity-70">Scroll speed</span>
                            <input
                                type="range"
                                min={10}
                                max={300}
                                step={10}
                                value={scrollSpeed}
                                onChange={e => {
                                    setScrollSpeed(Number(e.target.value))
                                    saveSetting("novels-scroll-speed", e.target.value)
                                }}
                            />
                            <span className="opacity-70">{scrollSpeed} px/s</span>
                        </div>
                        {!ttsSupported && (
                            <p className="opacity-70">Text-to-speech is not available in this browser.</p>
                        )}
                    </div>
                )}

                <div
                    className="rounded-lg p-6 sm:p-10"
                    style={{
                        background: t.bg,
                        color: t.fg,
                        fontFamily: fontFamily === "serif" ? "Georgia, 'Times New Roman', serif" : "inherit",
                    }}
                >
                    <h1 className="mb-6 text-2xl font-bold">{content?.title || chapter.title}</h1>

                    {contentLoading && <p className="opacity-70">Loading chapter...</p>}

                    <div className="space-y-2" style={{ fontSize: fontSize, lineHeight: 1.8 }}>
                        {content?.paragraphs.map((p, i) => (
                            <p
                                key={i}
                                id={"novel-p-" + i}
                                className="-mx-2 rounded px-2 py-1"
                                style={ttsOn && ttsIdx === i ? { background: t.hl } : undefined}
                                onClick={() => {
                                    if (ttsOn) speak(i)
                                }}
                            >
                                {p}
                            </p>
                        ))}
                    </div>
                </div>

                <div className="mt-6 flex justify-between">
                    <button className={btn} onClick={goPrev} disabled={!canPrev}>Previous</button>
                    <button className={btn} onClick={goNext} disabled={!canNext}>Next</button>
                </div>
            </div>
        </div>
    )
}