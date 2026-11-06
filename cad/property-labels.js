// Labels for versioned CAD command parameters. Keeping this dictionary outside
// the workspace controller makes command presentation data reusable and auditable.
export const propertyLabels={
  points:'底面の作図点 XYZ（順序付き）',chainPolicy:'edge連鎖の選択',radiiMm:'3軸半径 XYZ mm',transitionMode:'Pipe角部の方式',frameMode:'フレーム',distance1Mm:'距離1 mm（指定face側）',distance2Mm:'距離2 mm（nullは等距離）',
  anchor:'基準点 XYZ',point:'点 XYZ',start:'始点 XYZ',end:'終点 XYZ',center:'中心 XYZ',
  widthMm:'幅 mm',heightMm:'高さ mm',depthMm:'奥行 mm',radiusMm:'半径 mm',distanceMm:'距離 mm（両側は合計）',
  direction:'方向 XYZ',cap:'蓋を作る',bothSides:'両側',rounding:'角丸',cornerRadiusMm:'角丸半径 mm',thicknessMm:'厚み mm',
  style:'Loft方式',closed:'閉じる',plane:'作業平面',translation:'移動 XYZ',axis:'軸（原点・方向）',angleRad:'角度 rad',
  factor:'倍率',axisFactors:'軸倍率 XYZ',anchorMode:'基準モード',keepTools:'工具を保持する',allowMultipleGroups:'離れた連結グループも全て保持',
  splitParameters:'切断parameter（正本の値）',removePoint:'削除区間内のXYZ',removeParameter:'削除区間内のparameter',
  method:'延長方式',targetParameter:'到達交点のparameter（複数候補時）',connectionPoint:'交点・接続側を示すXYZ',solutionIndex:'接続候補番号',trim:'元曲線をトリム',keepInputs:'元曲線を残す',
  firstDistanceMm:'第1曲線の距離 mm',secondDistanceMm:'第2曲線の距離 mm',firstSide:'第1曲線の保持側',secondSide:'第2曲線の保持側',
  firstEnd:'第1曲線の端点',secondEnd:'第2曲線の端点',continuity:'接続の連続性',handleLengthMm:'接線制御長 mm',
  controlPointCount:'制御点数',acceptApproximation:'計測偏差を確認し近似として確定',seamParameter:'継ぎ目parameter',seamPoint:'継ぎ目のXYZ',
  poleIndex:'制御点番号（1始まり）',position:'移動先XYZ',knot:'挿入するknot',knotIndex:'削除するknot番号',multiplicity:'knot多重度',toleranceMm:'削除許容差 mm',
};
