import React from 'react';

interface PrintReportProps {
  /** A4 page images from renderReportPages(), the same pages the PDF download contains */
  pages: string[];
}

/**
 * The only thing that is printed with window.print(): hidden on screen, shown in print.
 * It is made of the same page images as the PDF, so the printout matches the PDF exactly.
 */
export const PrintReport: React.FC<PrintReportProps> = ({ pages }) => (
  <section id="print-report" className="hidden">
    {pages.map((src, i) => (
      <img key={i} src={src} alt={`รายงานหน้า ${i + 1}`} />
    ))}
  </section>
);
