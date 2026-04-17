export type CmoLevel = 1 | 2 | 3;

export interface CmoScoringThreshold {
  minScore: number;
  level: CmoLevel;
  label: string;
}

export interface CmoScoringVariableOption {
  value: string;
  label: string;
  points: number;
}

export interface CmoScoringVariableDefinition {
  id: string;
  label: string;
  options: CmoScoringVariableOption[];
}

export interface CmoMatchedVariable {
  id: string;
  label: string;
  value: string;
  optionLabel: string;
  points: number;
}

export interface CmoScoringBreakdownLine {
  variableId: string;
  variableLabel: string;
  selection: string;
  points: number;
}

export interface CmoScoringResult {
  version: string;
  score: number;
  level: CmoLevel;
  label: string;
  matchedVariables: CmoMatchedVariable[];
  breakdown: CmoScoringBreakdownLine[];
  explanation: string;
}

export interface CmoScoringEngine {
  version: string;
  evaluate(selections: Record<string, string | number | null | undefined>): CmoScoringResult;
}

interface CmoScoringEngineConfig {
  version: string;
  variableDefinitions: CmoScoringVariableDefinition[];
  thresholds: CmoScoringThreshold[];
}

const defaultThresholds: CmoScoringThreshold[] = [
  { minScore: 37, level: 1, label: 'Level 1 Priority' },
  { minScore: 27, level: 2, label: 'Level 2 Intermediate' },
  { minScore: 0, level: 3, label: 'Level 3 Basal' },
];

export function createCmoScoringEngine(config: CmoScoringEngineConfig): CmoScoringEngine {
  const sortedThresholds = [...config.thresholds].sort((a, b) => b.minScore - a.minScore);

  return {
    version: config.version,
    evaluate(selections: Record<string, string | number | null | undefined>): CmoScoringResult {
      const matchedVariables: CmoMatchedVariable[] = [];

      for (const variableDefinition of config.variableDefinitions) {
        const selectedValue = selections?.[variableDefinition.id];
        if (selectedValue === null || selectedValue === undefined || selectedValue === '') continue;

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
        explanation: explanationLines.join('\n'),
      };
    },
  };
}

export { defaultThresholds };
