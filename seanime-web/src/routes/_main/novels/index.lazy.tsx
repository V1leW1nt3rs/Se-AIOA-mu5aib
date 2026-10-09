import Page from "@/app/(main)/novels/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/novels/")({
    component: Page,
})
