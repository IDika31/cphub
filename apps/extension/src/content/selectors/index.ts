// versioned selectors for Codeforces
export const CF_SELECTORS = {
  v1: {
    title: ".problem-statement .header .title",
    statement: ".problem-statement",
    timeLimit: ".time-limit",
    memoryLimit: ".memory-limit",
    inputSpec: ".input-specification",
    outputSpec: ".output-specification",
    sampleInput: ".input pre",
    sampleOutput: ".output pre",
    tags: ".tag-box",
    submissionTable: "table.status-frame-datatable",
    submissionRows: "table.status-frame-datatable tr",
    profileHandle: ".main-info h1 a",
    profileRating: ".info ul li span",
  },
};

export const TLX_SELECTORS = {
  v1: {
    title: "h1, .problem-title",
    statement: ".problem-statement, .content, article",
    tags: ".tag, .badge",
    sampleInput: ".sample-input pre, pre.sample-input",
    sampleOutput: ".sample-output pre, pre.sample-output",
  },
};
