import { notFound } from "next/navigation";
import { connection } from "next/server";
import { LessonEditor } from "@/components/admin/lesson-editor";
import { loadLessonForEditing } from "@/lib/admin/queries";
import { requireStaff } from "@/lib/auth";
import { changeLessonStatus, restoreLessonVersion, saveLesson } from "./actions";

export const metadata = { title: "Editar lição · Conteúdo" };

export default async function EditLessonPage(props: PageProps<"/admin/licao/[slug]">) {
  await connection();
  const { slug } = await props.params;
  const { supabase, role } = await requireStaff();

  const lesson = await loadLessonForEditing(supabase, slug);
  if (!lesson) notFound();

  return (
    <main className="flex-1 px-4 pb-16">
      <LessonEditor
        lesson={lesson}
        role={role}
        previewHref={`/admin/licao/${slug}/previa`}
        actions={{
          save: saveLesson.bind(null, slug),
          changeStatus: changeLessonStatus.bind(null, slug),
          restore: restoreLessonVersion.bind(null, slug),
        }}
      />
    </main>
  );
}
