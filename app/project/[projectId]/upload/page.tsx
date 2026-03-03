import FileUpload from "@/components/FileUpload";

export default function UploadPage({ params }: { params: { projectId: string } }) {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Upload Project Files</h1>
      <FileUpload projectId={params.projectId} />
    </main>
  );
}
