export function diagnostic(
  code,
  message,
  featureId = null,
  actions = [],
  causeFeatureIds = [],
) {
  return {
    code,
    severity: "error",
    featureId,
    entityIds: [],
    subshapeRefs: [],
    causeFeatureIds,
    message,
    actions: actions.map((id) => ({
      id,
      label:
        {
          editParameters: "設定を編集",
          reselectReference: "対象を選び直す",
          retry: "再計算",
          restartRuntime: "CADランタイムを再起動",
          openCauseFeature: "原因の操作を開く",
        }[id] || id,
      targetFeatureId: featureId,
      targetInputKey: null,
      targetParameterKey: null,
      focusEntityIds: [],
    })),
    details: {},
  };
}
