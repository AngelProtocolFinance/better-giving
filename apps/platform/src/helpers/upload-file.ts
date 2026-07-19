export async function uploadFile(file: File) {
  const res = await fetch(
    `/api/file-upload?filename=${window.encodeURIComponent(file.name)}`,
    { method: "POST", body: file }
  );
  if (!res.ok) throw res;

  const { url } = await res.json();
  return url as string;
}
