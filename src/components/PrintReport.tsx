import React from 'react';

interface PrintReportProps {
  /** A4 page images from renderReportPages(), the printout layout: same style as the PDF but without the parking floor and department columns */
  pages: string[];
}

/**
 * The only thing that is printed with window.print(): hidden on screen, shown in print.
 * It is made of page images drawn by the same code as the PDF (print layout).
 */
export const PrintReport: React.FC<PrintReportProps> = ({ pages }) => (
  <section id="print-report" className="hidden">
    {pages.map((src, i) => (
      <img key={i} src={src} alt={`รายงานหน้า ${i + 1}`} />
    ))}
  </section>
);
