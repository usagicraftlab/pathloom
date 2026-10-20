export function explainOperationError(error) {
  const details = String(error?.message || error || 'Unknown error');
  if (/cancel/i.test(details)) return {title:'生成を中断しました',hint:'指示は残っています。編集して再実行できます。',details};
  if (/rate.?limit|quota|exhaust|usage|plan limit/i.test(details)) return {title:'AIの利用枠を確認してください',hint:'AI設定で利用状況を確認し、枠が回復してから再実行してください。',details};
  if (/sign.?in|account|authentication|not connected|requires Pathloom Desktop|codex.*not found|CLI/i.test(details)) return {title:'AIに接続できません',hint:'AI設定を開き、ローカルCodexの接続・サインインを確認してください。',details};
  if (/timeout|timed out|exceed.*seconds|generation limit/i.test(details)) return {title:'処理時間の上限に達しました',hint:'層数・点数・コピー数を減らすか、処理を小さなComponentに分けて再実行してください。',details};
  if (/changed|stale|supersed/i.test(details)) return {title:'編集内容が変わったため適用しませんでした',hint:'現在の形状に対してもう一度生成してください。',details};
  if (/intersect|planar|nonnegative|below.*bed|zero.length|geometry|curve|B-rep|section|output/i.test(details)) return {title:'生成した形状を適用できませんでした',hint:'下の詳細で対象Componentや座標条件を確認し、指示を修正してください。',details};
  return {title:'生成を完了できませんでした',hint:'指示は残っています。詳細を確認して修正・再実行してください。',details};
}
