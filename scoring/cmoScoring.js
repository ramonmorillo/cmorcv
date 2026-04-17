export const defaultThresholds = [
  { minScore: 37, level: 1, label: "Level 1 Priority" },
  { minScore: 27, level: 2, label: "Level 2 Intermediate" },
  { minScore: 0, level: 3, label: "Level 3 Basal" },
];

export function createCmoScoringEngine(config) {
  const sortedThresholds = [...config.thresholds].sort((a, b) => b.minScore - a.minScore);

  return {
    version: config.version,
    evaluate(selections) {
      const matchedVariables = [];

      for (const variableDefinition of config.variableDefinitions) {
        const selectedValue = selections?.[variableDefinition.id];
        if (selectedValue === null || selectedValue === undefined || selectedValue === "") continue;

        const selectedOption = variableDefinition.options.find(
          (option) => String(option.value) === String(selectedValue),
        );
        if (!selectedOption) continue;

        matchedVariables.push({
          id: variableDefinition.id,
          label: variableDefinition.label,
          value: String(selectedValue),
          optionLabel: selectedOption.label,
          points: Number(selectedOption.points || 0),
        });
      }

      const score = matchedVariables.reduce((acc, matched) => acc + matched.points, 0);
      const thresholdMatch =
        sortedThresholds.find((threshold) => score >= threshold.minScore) || sortedThresholds[sortedThresholds.length - 1];

      const breakdown = matchedVariables.map((matched) => ({
        variableId: matched.id,
        variableLabel: matched.label,
        selection: `${matched.optionLabel}`,
        points: matched.points,
      }));

      const explanationLines = [
        `CMO ${config.version}: score ${score} => ${thresholdMatch.label}.`,
        ...breakdown.map((line) => `- ${line.variableLabel}: ${line.selection} (${line.points} pts)`),
      ];

      return {
        version: config.version,
        score,
        level: thresholdMatch.level,
        label: thresholdMatch.label,
        matchedVariables,
        breakdown,
        explanation: explanationLines.join("\n"),
      };
    },
  };
}

if (typeof window !== "undefined") {
  window.CMOScoring = {
    createCmoScoringEngine,
    defaultThresholds,
  };
}
