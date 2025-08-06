import { getResume } from "@/actions/resume";
import ResumeBuilder from "./_components/resume-builder";

export default async function ResumePage() {
  const resume = await getResume();

  return (
    <div className="container px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 py-6">
      <ResumeBuilder initialContent={resume?.content} />
    </div>
  );
}
