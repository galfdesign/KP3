import React, { useState } from 'react';
import { FileDown, Check, Loader2 } from 'lucide-react';
import logo from '../logo.png';
import { CostCategory } from '../types';

interface FloorArea {
  id: string;
  name: string;
  area: number;
}

interface OfficialKPPdfProps {
  mainArea: number;
  floorAreas: FloorArea[];
  totalArea: number;
  categories: CostCategory[];
  enabledCategories: CostCategory[];
  disabledCategories: CostCategory[];
  finalTotalCost: number;
  totalPricePerM2: number;
  getCategoryCost: (cat: CostCategory) => number;
  getCategoryDisplayPrice: (cat: CostCategory) => number;
}

const fmtRub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const fmtArea = (n: number) => `${Math.round(n)} м²`;

const today = () => {
  const d = new Date();
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// Brand palette
const COLORS = {
  primary: '#4f46e5',
  primaryDark: '#1e1b4b',
  text: '#1e293b',
  body: '#334155',
  muted: '#64748b',
  faint: '#94a3b8',
  bgSoft: '#f8fafc',
  bgIndigo: '#eef2ff',
  border: '#e2e8f0',
  borderIndigo: '#c7d2fe',
};

/** Loads an image URL into a base64 data URL (needed by pdfmake for images). */
async function loadImageAsDataURL(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Dynamically loads pdfmake + virtual file system. Returns the configured pdfMake. */
async function loadPdfMake(): Promise<any> {
  const pdfMakeMod: any = await import('pdfmake/build/pdfmake');
  const vfsMod: any = await import('pdfmake/build/vfs_fonts');
  const pdfMake = pdfMakeMod.default || pdfMakeMod;
  const vfs =
    vfsMod?.default?.pdfMake?.vfs ||
    vfsMod?.pdfMake?.vfs ||
    vfsMod?.default ||
    vfsMod;
  if (typeof pdfMake.addVirtualFileSystem === 'function') {
    pdfMake.addVirtualFileSystem(vfs);
  } else {
    pdfMake.vfs = vfs;
  }
  return pdfMake;
}

export const OfficialKPPdfButton: React.FC<OfficialKPPdfProps> = ({
  mainArea,
  floorAreas,
  totalArea,
  enabledCategories,
  disabledCategories,
  finalTotalCost,
  totalPricePerM2,
  getCategoryCost,
}) => {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const handleDownload = async () => {
    if (busy || totalArea <= 0) return;
    setBusy(true);
    setDone(false);
    try {
      const [pdfMake, logoData] = await Promise.all([
        loadPdfMake(),
        loadImageAsDataURL(logo as unknown as string),
      ]);

      const safeArea = Math.round(totalArea);

      // ---- 1. Исходные данные ----
      const areaRows: any[][] = [
        [
          { text: 'Уровень / зона', style: 'th' },
          { text: 'Отапливаемая площадь', style: 'th', alignment: 'right' },
        ],
      ];
      if (mainArea > 0)
        areaRows.push([
          { text: 'Основная площадь', style: 'td' },
          { text: fmtArea(mainArea), style: 'td', alignment: 'right' },
        ]);
      floorAreas.forEach((f) => {
        areaRows.push([
          { text: f.name || 'Зона', style: 'td' },
          { text: fmtArea(f.area), style: 'td', alignment: 'right' },
        ]);
      });
      if (areaRows.length === 1) {
        areaRows.push([
          { text: 'Отапливаемая площадь', style: 'td' },
          { text: fmtArea(totalArea), style: 'td', alignment: 'right' },
        ]);
      }
      areaRows.push([
        { text: 'Итого', style: 'tdTotal' },
        { text: fmtArea(totalArea), style: 'tdTotal', alignment: 'right' },
      ]);

      // ---- 2. Расчет / детализация ----
      const detailRows: any[][] = [
        [
          { text: 'Раздел проектирования', style: 'th' },
          { text: 'Стоимость', style: 'th', alignment: 'right' },
        ],
      ];
      enabledCategories.forEach((cat) => {
        const sum = getCategoryCost(cat);
        detailRows.push([
          { text: cat.name, style: 'td' },
          { text: fmtRub(sum), style: 'td', alignment: 'right' },
        ]);
      });
      detailRows.push([
        { text: 'Итого по основному составу', style: 'tdTotal' },
        { text: fmtRub(finalTotalCost), style: 'tdTotal', alignment: 'right' },
      ]);

      // ---- 3. Дополнительные опции ----
      const hasAdditional = disabledCategories.length > 0;
      const additionalRows: any[][] = [
        [
          { text: 'Дополнительная опция', style: 'th' },
          { text: 'Расчет', style: 'th' },
          { text: 'Стоимость', style: 'th', alignment: 'right' },
        ],
      ];
      disabledCategories.forEach((cat) => {
        const sum = getCategoryCost(cat);
        additionalRows.push([
          { text: cat.name, style: 'td' },
          { text: `${cat.pricePerEb} ₽/м² × ${safeArea} м²`, style: 'td' },
          { text: fmtRub(sum), style: 'td', alignment: 'right' },
        ]);
      });

      const effectiveRate = safeArea > 0 ? Math.round(finalTotalCost / safeArea) : totalPricePerM2;

      // shared layout for "boxed" tables (light borders, header fill, zebra rows, total row)
      const dataTableLayout = {
        fillColor: (rowIndex: number, node: any) => {
          if (rowIndex === 0) return COLORS.bgIndigo; // header
          if (rowIndex === node.table.body.length - 1) return COLORS.bgIndigo; // total
          return rowIndex % 2 === 0 ? null : '#f8fafc';
        },
        hLineColor: () => COLORS.border,
        vLineColor: () => COLORS.border,
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        paddingTop: () => 5,
        paddingBottom: () => 5,
        paddingLeft: () => 8,
        paddingRight: () => 8,
      };

      const sectionTitle = (_n: number, title: string): any => ({
        text: title,
        color: COLORS.primaryDark,
        bold: true,
        fontSize: 13,
        margin: [0, 0, 0, 8],
      });

      // Three summary cards row (Section 2 header)
      const summaryCards: any = {
        columns: [
          {
            width: '*',
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    stack: [
                      {
                        text: 'РАСЧЕТНАЯ СТАВКА',
                        color: COLORS.muted,
                        fontSize: 8,
                        characterSpacing: 0.5,
                        bold: true,
                      },
                      {
                        text: `${effectiveRate} ₽/м²`,
                        color: COLORS.primaryDark,
                        fontSize: 15,
                        bold: true,
                        margin: [0, 2, 0, 0],
                      },
                    ],
                    fillColor: COLORS.bgSoft,
                  },
                ],
              ],
            },
            layout: {
              hLineColor: () => COLORS.border,
              vLineColor: () => COLORS.border,
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              paddingTop: () => 8,
              paddingBottom: () => 8,
              paddingLeft: () => 10,
              paddingRight: () => 10,
            },
          },
          {
            width: '*',
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    stack: [
                      {
                        text: 'ОТАПЛИВАЕМАЯ ПЛОЩАДЬ',
                        color: COLORS.muted,
                        fontSize: 8,
                        characterSpacing: 0.5,
                        bold: true,
                      },
                      {
                        text: fmtArea(totalArea),
                        color: COLORS.primaryDark,
                        fontSize: 15,
                        bold: true,
                        margin: [0, 2, 0, 0],
                      },
                    ],
                    fillColor: COLORS.bgSoft,
                  },
                ],
              ],
            },
            layout: {
              hLineColor: () => COLORS.border,
              vLineColor: () => COLORS.border,
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              paddingTop: () => 8,
              paddingBottom: () => 8,
              paddingLeft: () => 10,
              paddingRight: () => 10,
            },
          },
          {
            width: '*',
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    stack: [
                      {
                        text: 'ИТОГО К ОПЛАТЕ',
                        color: '#c7d2fe',
                        fontSize: 8,
                        characterSpacing: 0.5,
                        bold: true,
                      },
                      {
                        text: fmtRub(finalTotalCost),
                        color: '#ffffff',
                        fontSize: 17,
                        bold: true,
                        margin: [0, 2, 0, 0],
                      },
                    ],
                    fillColor: COLORS.primary,
                  },
                ],
              ],
            },
            layout: {
              hLineWidth: () => 0,
              vLineWidth: () => 0,
              paddingTop: () => 8,
              paddingBottom: () => 8,
              paddingLeft: () => 10,
              paddingRight: () => 10,
            },
          },
        ],
        columnGap: 8,
        margin: [0, 0, 0, 10],
      };

      // ---- Document definition ----
      const docDefinition: any = {
        pageSize: 'A4',
        pageMargins: [40, 70, 40, 50],

        header: {
          margin: [40, 22, 40, 0],
          stack: [
            {
              columns: [
                {
                  image: logoData,
                  fit: [140, 32],
                  width: '*',
                },
                {
                  width: 'auto',
                  table: {
                    body: [
                      [
                        {
                          text: `Дата: ${today()}`,
                          color: COLORS.body,
                          fontSize: 9,
                          fillColor: '#f1f5f9',
                        },
                      ],
                    ],
                  },
                  layout: {
                    hLineColor: () => COLORS.border,
                    vLineColor: () => COLORS.border,
                    hLineWidth: () => 0.5,
                    vLineWidth: () => 0.5,
                    paddingTop: () => 4,
                    paddingBottom: () => 4,
                    paddingLeft: () => 10,
                    paddingRight: () => 10,
                  },
                  margin: [0, 8, 0, 0],
                },
              ],
              columnGap: 10,
            },
            {
              canvas: [
                {
                  type: 'line',
                  x1: 0,
                  y1: 6,
                  x2: 515,
                  y2: 6,
                  lineWidth: 1.2,
                  lineColor: COLORS.primary,
                },
              ],
            },
          ],
        },

        footer: (currentPage: number, pageCount: number) => ({
          margin: [40, 6, 40, 0],
          stack: [
            {
              canvas: [
                {
                  type: 'line',
                  x1: 0,
                  y1: 0,
                  x2: 515,
                  y2: 0,
                  lineWidth: 0.5,
                  lineColor: COLORS.border,
                },
              ],
            },
            {
              columns: [
                {
                  text: 'Galf Design · инженерные системы: проектирование и монтаж',
                  color: COLORS.faint,
                  fontSize: 8,
                },
                {
                  text: `Страница ${currentPage} из ${pageCount}`,
                  color: COLORS.faint,
                  fontSize: 8,
                  alignment: 'right',
                },
              ],
              margin: [0, 4, 0, 0],
            },
          ],
        }),

        content: [
          // ===== Title =====
          {
            text: 'Коммерческое предложение',
            fontSize: 22,
            bold: true,
            color: COLORS.primaryDark,
            margin: [0, 0, 0, 2],
          },
          {
            text: 'на проектирование инженерных систем частного дома',
            fontSize: 12,
            color: COLORS.body,
            margin: [0, 0, 0, 14],
          },
          // Preamble
          {
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    text:
                      'Подготовлен расчет стоимости проектных работ по отапливаемой площади объекта. Расчет сформирован на основании предоставленных исходных данных и предназначен для предварительного согласования состава и бюджета проектирования.',
                    color: COLORS.body,
                    fontSize: 10,
                    fillColor: COLORS.bgSoft,
                  },
                ],
              ],
            },
            layout: {
              hLineColor: (i: number) => (i === 0 || i === 1 ? COLORS.border : null),
              vLineColor: (i: number) =>
                i === 0 ? COLORS.primary : i === 1 ? COLORS.border : null,
              hLineWidth: () => 0.5,
              vLineWidth: (i: number) => (i === 0 ? 2.5 : 0.5),
              paddingTop: () => 8,
              paddingBottom: () => 8,
              paddingLeft: () => 10,
              paddingRight: () => 10,
            },
            margin: [0, 0, 0, 16],
          },

          // ===== Section 1 =====
          sectionTitle(1, 'Исходные данные по объекту'),
          {
            table: { widths: ['*', 'auto'], body: areaRows },
            layout: dataTableLayout,
            margin: [0, 0, 0, 16],
          },

          // ===== Section 2 =====
          sectionTitle(2, 'Расчет стоимости проектирования'),
          summaryCards,
          {
            text: 'Детализация по разделам',
            color: COLORS.body,
            bold: true,
            fontSize: 10,
            margin: [0, 6, 0, 4],
          },
          {
            table: { widths: ['*', 'auto'], body: detailRows },
            layout: dataTableLayout,
            margin: [0, 0, 0, 12],
          },

          // Page break before page 2
          { text: '', pageBreak: 'after' },

          // ===== Section 3: Additional options =====
          ...(hasAdditional
            ? [
                sectionTitle(3, 'Дополнительно может быть включено в КП'),
                {
                  table: { widths: ['*', 'auto', 'auto'], body: additionalRows },
                  layout: dataTableLayout,
                  margin: [0, 0, 0, 16],
                },
              ]
            : []),

          // ===== Conditions =====
          sectionTitle(hasAdditional ? 4 : 3, 'Условия и примечания'),
          {
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    text:
                      'Состав, сроки выполнения и этапность проектирования уточняются после согласования технического задания, архитектурных планов и исходных данных по оборудованию. Стоимость дополнительных разделов и изменений, выходящих за рамки согласованного задания, согласуется отдельно.',
                    color: COLORS.body,
                    fontSize: 10,
                    fillColor: COLORS.bgSoft,
                    lineHeight: 1.35,
                  },
                ],
              ],
            },
            layout: {
              hLineColor: () => COLORS.border,
              vLineColor: () => COLORS.border,
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              paddingTop: () => 8,
              paddingBottom: () => 8,
              paddingLeft: () => 10,
              paddingRight: () => 10,
            },
            margin: [0, 0, 0, 16],
          },

          // ===== About company =====
          sectionTitle(hasAdditional ? 5 : 4, 'О компании Galf Design'),
          {
            text:
              'Galf Design занимается проектированием и монтажом инженерных систем в частных домах и квартирах. В работе используются внутренние стандарты контроля качества, типовые проверенные решения и практический опыт реализованных объектов.',
            color: COLORS.body,
            fontSize: 10,
            margin: [0, 0, 0, 6],
            lineHeight: 1.35,
          },
          {
            ul: [
              {
                text: [
                  { text: 'Профиль: ', bold: true, color: COLORS.primaryDark },
                  'отопление, котельные и тепловые пункты, водоснабжение, канализация, теплый пол, вентиляция и кондиционирование.',
                ],
              },
              {
                text: [
                  { text: 'Практика: ', bold: true, color: COLORS.primaryDark },
                  'более тысячи выполненных объектов по монтажу инженерных систем и несколько тысяч сданных проектов.',
                ],
              },
              {
                text: [
                  { text: 'Подход к проектированию: ', bold: true, color: COLORS.primaryDark },
                  'интеграция инженерных решений в 3D-архитектуру с высоким уровнем детализации.',
                ],
              },
              {
                text: [
                  { text: 'Принципы работы: ', bold: true, color: COLORS.primaryDark },
                  'репутация, прозрачность, открытость и внимание к деталям.',
                ],
              },
            ],
            color: COLORS.body,
            fontSize: 10,
            lineHeight: 1.4,
            margin: [0, 0, 0, 14],
          },

          // ===== Contacts =====
          sectionTitle(hasAdditional ? 6 : 5, 'Контакты и полезные ссылки'),
          {
            columns: [
              {
                width: '*',
                table: {
                  widths: ['*'],
                  body: [
                    [
                      {
                        columns: [
                          {
                            width: '*',
                            stack: [
                              {
                                text: 'Сайт компании',
                                color: COLORS.muted,
                                fontSize: 9,
                                bold: true,
                              },
                              {
                                text: 'https://galf.ru/',
                                color: COLORS.primary,
                                fontSize: 11,
                                bold: true,
                                link: 'https://galf.ru/',
                                margin: [0, 4, 0, 0],
                              },
                              {
                                text: 'Наведите камеру для перехода',
                                color: COLORS.faint,
                                fontSize: 8,
                                margin: [0, 4, 0, 0],
                              },
                            ],
                          },
                          {
                            width: 'auto',
                            stack: [
                              {
                                qr: 'https://galf.ru/',
                                fit: 58,
                                version: 3,
                                eccLevel: 'M',
                                foreground: COLORS.primaryDark,
                              },
                            ],
                            alignment: 'right',
                          },
                        ],
                        columnGap: 8,
                        fillColor: COLORS.bgSoft,
                      },
                    ],
                  ],
                },
                layout: {
                  hLineColor: () => COLORS.border,
                  vLineColor: () => COLORS.border,
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  paddingTop: () => 8,
                  paddingBottom: () => 8,
                  paddingLeft: () => 10,
                  paddingRight: () => 10,
                },
              },
              {
                width: '*',
                table: {
                  widths: ['*'],
                  body: [
                    [
                      {
                        columns: [
                          {
                            width: '*',
                            stack: [
                              {
                                text: 'Telegram-канал',
                                color: COLORS.muted,
                                fontSize: 9,
                                bold: true,
                              },
                              {
                                text: 'https://t.me/galfdesign',
                                color: COLORS.primary,
                                fontSize: 11,
                                bold: true,
                                link: 'https://t.me/galfdesign',
                                margin: [0, 4, 0, 0],
                              },
                              {
                                text: 'Наведите камеру для перехода',
                                color: COLORS.faint,
                                fontSize: 8,
                                margin: [0, 4, 0, 0],
                              },
                            ],
                          },
                          {
                            width: 'auto',
                            stack: [
                              {
                                qr: 'https://t.me/galfdesign',
                                fit: 58,
                                version: 3,
                                eccLevel: 'M',
                                foreground: COLORS.primaryDark,
                              },
                            ],
                            alignment: 'right',
                          },
                        ],
                        columnGap: 8,
                        fillColor: COLORS.bgSoft,
                      },
                    ],
                  ],
                },
                layout: {
                  hLineColor: () => COLORS.border,
                  vLineColor: () => COLORS.border,
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  paddingTop: () => 8,
                  paddingBottom: () => 8,
                  paddingLeft: () => 10,
                  paddingRight: () => 10,
                },
              },
            ],
            columnGap: 8,
            margin: [0, 0, 0, 8],
          },

          // Examples (3rd contact block — full width)
          {
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    columns: [
                      {
                        width: '*',
                        stack: [
                          {
                            text: 'Примеры проектов',
                            color: COLORS.muted,
                            fontSize: 9,
                            bold: true,
                          },
                          {
                            text: 'https://t.me/galfdesign/1809',
                            color: COLORS.primary,
                            fontSize: 11,
                            bold: true,
                            link: 'https://t.me/galfdesign/1809',
                            margin: [0, 4, 0, 0],
                          },
                          {
                            text:
                              'PDF с подборкой реализованных проектов — наведите камеру для скачивания',
                            color: COLORS.faint,
                            fontSize: 8,
                            margin: [0, 4, 0, 0],
                          },
                        ],
                      },
                      {
                        width: 'auto',
                        stack: [
                          {
                            qr: 'https://t.me/galfdesign/1809',
                            fit: 58,
                            version: 3,
                            eccLevel: 'M',
                            foreground: COLORS.primaryDark,
                          },
                        ],
                        alignment: 'right',
                      },
                    ],
                    columnGap: 8,
                    fillColor: COLORS.bgSoft,
                  },
                ],
              ],
            },
            layout: {
              hLineColor: () => COLORS.border,
              vLineColor: () => COLORS.border,
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              paddingTop: () => 8,
              paddingBottom: () => 8,
              paddingLeft: () => 10,
              paddingRight: () => 10,
            },
            margin: [0, 0, 0, 0],
          },

        ],

        styles: {
          th: {
            color: '#3730a3',
            bold: true,
            fontSize: 9,
            characterSpacing: 0.4,
          },
          td: {
            color: COLORS.body,
            fontSize: 10,
          },
          tdTotal: {
            color: COLORS.primaryDark,
            bold: true,
            fontSize: 10.5,
          },
        },

        defaultStyle: {
          font: 'Roboto',
          fontSize: 10,
          color: COLORS.text,
          lineHeight: 1.3,
        },
      };

      const fileName = `KP_Galf_Design_${today().replace(/\./g, '-')}.pdf`;
      pdfMake.createPdf(docDefinition).download(fileName);
      setDone(true);
      setTimeout(() => setDone(false), 2200);
    } catch (e) {
      console.error('PDF generation error', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={busy || totalArea <= 0}
      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 rounded-xl text-sm text-white font-medium transition-all border border-indigo-500 shadow-md shadow-indigo-900/20 disabled:cursor-not-allowed disabled:shadow-none"
      title={totalArea <= 0 ? 'Сначала укажите площадь' : 'Сформировать официальное КП в PDF'}
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : done ? (
        <Check className="w-4 h-4" />
      ) : (
        <FileDown className="w-4 h-4" />
      )}
      {busy ? 'Формируется PDF…' : done ? 'PDF скачан!' : 'Скачать официальное КП (PDF)'}
    </button>
  );
};

export default OfficialKPPdfButton;
