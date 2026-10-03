/**
 * Validação de "magic bytes": o MIME type declarado pelo navegador (File.type)
 * é só metadado enviado pelo cliente e pode ser falsificado facilmente (ex.:
 * renomear um .exe para .pdf ou forjar o Content-Type). Antes de aceitar um
 * upload, conferimos a assinatura real dos primeiros bytes do arquivo contra
 * o MIME declarado — se não bater, rejeitamos.
 */
export async function verifyFileSignature(file: File, declaredMime: string): Promise<boolean> {
  const buffer = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const hex = Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  switch (declaredMime) {
    case 'application/pdf':
      return hex.startsWith('25504446'); // %PDF
    case 'image/png':
      return hex.startsWith('89504e470d0a1a0a');
    case 'image/jpeg':
      return hex.startsWith('ffd8ff');
    case 'image/webp':
      return hex.startsWith('52494646') && hex.slice(16, 24) === '57454250'; // RIFF....WEBP
    case 'application/msword':
      return hex.startsWith('d0cf11e0a1b11ae1'); // OLE compound file
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return hex.startsWith('504b0304') || hex.startsWith('504b0506') || hex.startsWith('504b0708'); // ZIP (docx is a zip)
    case 'video/mp4':
    case 'video/quicktime':
      // Caixa "ftyp" aparece nos primeiros bytes de MP4/MOV (offset 4).
      return hex.slice(8, 16) === '66747970';
    case 'video/webm':
      return hex.startsWith('1a45dfa3');
    default:
      return false;
  }
}
