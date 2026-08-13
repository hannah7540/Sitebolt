import { redirect } from "next/navigation";

/** Project admin home — main project console lives at `/`. */
export default function ProjectsIndexPage() {
  redirect("/");
}
