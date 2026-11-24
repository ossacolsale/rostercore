const paths = {
  calendar: "M7 3v4m10-4v4M4 10h16M4 6h16v14H4z",
  people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm3-4a4 4 0 0 1 0 8",
  configuration: "M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4",
  archive: "M4 8v12h16V8M3 4h18v4H3zM10 12h4",
  folder: "M3 5h7l2 3h9v12H3z",
  plus: "M12 5v14M5 12h14",
  link: "M10 13a4 4 0 0 0 6 0l4-4a4 4 0 1 0-6-6l-2 2m2 6a4 4 0 0 0-6 0l-4 4a4 4 0 1 0 6 6l2-2",
  demo: "m8 5 12 7-12 7z",
  upload: "M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4",
  download: "M12 4v12m-4-4 4 4 4-4M4 17v3h16v-3",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  back: "M19 12H5m5-5-5 5 5 5",
  spark: "M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z",
  edit: "m4 16 12-12 4 4L8 20H4zm10-10 4 4",
  check: "m5 12 4 4L19 6",
} as const;

export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={paths[name]} />
  </svg>;
}
