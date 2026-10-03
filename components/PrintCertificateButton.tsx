'use client';

export function PrintCertificateButton() {
  return (
    <button className="button" type="button" onClick={() => window.print()}>
      Imprimir ou salvar em PDF
    </button>
  );
}