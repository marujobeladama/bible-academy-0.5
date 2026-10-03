export interface UploadResponse {
  ok: boolean;
  status: number;
  data: { error?: string };
}

export function postUploadWithProgress(
  url: string,
  body: FormData,
  onProgress: (fraction: number) => void,
) {
  return new Promise<UploadResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.total > 0 ? event.loaded / event.total : 0);
    });
    request.addEventListener('load', () => {
      let data: UploadResponse['data'] = {};
      try {
        data = JSON.parse(request.responseText) as UploadResponse['data'];
      } catch {
        data = {};
      }
      resolve({ ok: request.status >= 200 && request.status < 300, status: request.status, data });
    });
    request.addEventListener('error', () => reject(new Error('Falha de rede durante o envio.')));
    request.addEventListener('abort', () => reject(new Error('Envio cancelado.')));
    request.send(body);
  });
}