// Pathloom Grasshopper C# Script body.
// Paste this into a Grasshopper C# Script component.
//
// Inputs:
//   Curves : Curve, List Access
//   Tools  : int,   List Access
//   Source : string, Item Access
//   Label  : string, Item Access
//   Step   : double, Item Access (sampling interval in mm for non-polylines)
//   Send   : bool,   Item Access
//
// Output:
//   Status : string
//
// Notes:
// - Curve list order becomes Pathloom path order.
// - Tools may contain one value (applied to every curve), or one value per curve.
// - Polyline curves keep their original vertices.
// - Other curves are sampled at approximately Step mm.
// - Keep Source stable if you want Pathloom to replace geometry while preserving
//   Pathloom-side color, placement, instances, speed, E-rate and print order.

if (!Send)
{
  Status = "Ready";
}
else if (Curves == null || Curves.Count == 0)
{
  Status = "No curves";
}
else if (Tools == null || Tools.Count == 0)
{
  Status = "Tools needs at least one value";
}
else if (Tools.Count != 1 && Tools.Count < Curves.Count)
{
  Status = "Tools must contain 1 value or one value per curve";
}
else
{
  try
  {
    string source = string.IsNullOrWhiteSpace(Source) ? "gh-live-1" : Source.Trim();
    string label = string.IsNullOrWhiteSpace(Label) ? "Grasshopper Live" : Label.Trim();
    double step = Step > 0 ? Step : 1.0;

    Func<string, string> jsonEscape = value =>
      (value ?? "")
        .Replace("\\", "\\\\")
        .Replace("\"", "\\\"")
        .Replace("\r", "\\r")
        .Replace("\n", "\\n");

    var inv = System.Globalization.CultureInfo.InvariantCulture;
    var json = new System.Text.StringBuilder();
    json.Append("{\"type\":\"toolpath.update\"");
    json.Append(",\"source\":\"").Append(jsonEscape(source)).Append("\"");
    json.Append(",\"label\":\"").Append(jsonEscape(label)).Append("\"");
    json.Append(",\"paths\":[");

    int validPathCount = 0;

    for (int i = 0; i < Curves.Count; i++)
    {
      var curve = Curves[i];
      if (curve == null || !curve.IsValid) continue;

      var points = new List<Rhino.Geometry.Point3d>();
      Rhino.Geometry.Polyline polyline;

      if (curve.TryGetPolyline(out polyline) && polyline.Count >= 2)
      {
        for (int p = 0; p < polyline.Count; p++)
          points.Add(polyline[p]);
      }
      else
      {
        double[] parameters = curve.DivideByLength(step, true);
        if (parameters != null)
        {
          for (int p = 0; p < parameters.Length; p++)
            points.Add(curve.PointAt(parameters[p]));
        }

        if (points.Count == 0 || points[0].DistanceTo(curve.PointAtStart) > 1e-9)
          points.Insert(0, curve.PointAtStart);
        if (points[points.Count - 1].DistanceTo(curve.PointAtEnd) > 1e-9)
          points.Add(curve.PointAtEnd);
      }

      if (points.Count < 2) continue;

      int tool = Tools.Count == 1 ? Tools[0] : Tools[i];

      if (validPathCount > 0) json.Append(',');
      json.Append("{\"order\":").Append(validPathCount);
      json.Append(",\"tool\":").Append(tool);
      json.Append(",\"points\":[");

      for (int p = 0; p < points.Count; p++)
      {
        if (p > 0) json.Append(',');
        var pt = points[p];
        json.Append('[')
          .Append(pt.X.ToString("R", inv)).Append(',')
          .Append(pt.Y.ToString("R", inv)).Append(',')
          .Append(pt.Z.ToString("R", inv)).Append(']');
      }

      json.Append("]}");
      validPathCount++;
    }

    json.Append("]}");

    if (validPathCount == 0)
    {
      Status = "No valid curves to send";
    }
    else
    {
      using (var socket = new System.Net.WebSockets.ClientWebSocket())
      {
        socket.ConnectAsync(
          new System.Uri("ws://127.0.0.1:8765"),
          System.Threading.CancellationToken.None
        ).GetAwaiter().GetResult();

        var bytes = System.Text.Encoding.UTF8.GetBytes(json.ToString());
        socket.SendAsync(
          new System.ArraySegment<byte>(bytes),
          System.Net.WebSockets.WebSocketMessageType.Text,
          true,
          System.Threading.CancellationToken.None
        ).GetAwaiter().GetResult();
      }

      Status = string.Format(
        inv,
        "Sent {0} paths to Pathloom · {1}",
        validPathCount,
        source
      );
    }
  }
  catch (System.Exception ex)
  {
    Status = "Pathloom connection failed: " + ex.Message;
  }
}
