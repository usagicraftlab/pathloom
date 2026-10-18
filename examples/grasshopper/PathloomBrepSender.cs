// Rhino 7/8 Grasshopper C# Script BODY (inside RunScript).
// Inputs: Breps (Brep, List Access), Source (string, Item), Label (string, Item),
//         Send (bool, Item). Output: Status (string).
// Keep Send=true. Each GH solution sends its latest exact B-reps to Pathloom.
// Source defaults to gh-brep-1; use a different stable Source for each sender.
// The active Rhino document is never modified. Export uses a temporary headless
// document. Units are converted to mm; Rhino world coordinates are preserved.
Status = "Paused";
if (Send)
{
  string file = null;
  try
  {
    string source = string.IsNullOrWhiteSpace(Source) ? "gh-brep-1" : Source.Trim();
    string label = string.IsNullOrWhiteSpace(Label) ? "Rhino B-rep" : Label.Trim();
    if (source.Length > 120 || label.Length > 120) throw new System.Exception("Source and Label must be at most 120 characters");
    System.Func<string,string> quote = value => {
      var result = new System.Text.StringBuilder("\"");
      foreach (char c in value ?? "") {
        if (c == '\\') result.Append("\\\\");
        else if (c == '\"') result.Append("\\\"");
        else if (c < 32) result.Append("\\u").Append(((int)c).ToString("x4"));
        else result.Append(c);
      }
      return result.Append("\"").ToString();
    };
    string step = null;
    int count = 0;
    if (Breps != null && Breps.Count > 0)
    {
      file = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "pathloom-" + System.Guid.NewGuid().ToString("N") + ".step");
      using (var doc = Rhino.RhinoDoc.CreateHeadless(null))
      {
        doc.ModelUnitSystem = Rhino.UnitSystem.Millimeters;
        var active = Rhino.RhinoDoc.ActiveDoc;
        double scale = active == null ? 1.0 : Rhino.RhinoMath.UnitScale(active.ModelUnitSystem, Rhino.UnitSystem.Millimeters);
        if (active != null) { doc.ModelAbsoluteTolerance = active.ModelAbsoluteTolerance * scale; doc.ModelAngleToleranceRadians = active.ModelAngleToleranceRadians; }
        foreach (var brep in Breps)
        {
          if (brep == null || !brep.IsValid) throw new System.Exception("Input contains a missing or invalid B-rep; previous geometry was kept");
          using (var copy = brep.DuplicateBrep())
          {
            if (System.Math.Abs(scale - 1.0) > 1e-12) copy.Transform(Rhino.Geometry.Transform.Scale(Rhino.Geometry.Point3d.Origin, scale));
            if (doc.Objects.AddBrep(copy) == System.Guid.Empty) throw new System.Exception("Unable to stage B-rep for export");
          }
          count++;
        }
        if (!Rhino.FileIO.FileStp.Write(file, doc, new Rhino.FileIO.FileStpWriteOptions())) throw new System.Exception("Rhino STEP export failed");
      }
      if (new System.IO.FileInfo(file).Length > 16 * 1024 * 1024) throw new System.Exception("Live STEP exceeds the 16 MB limit");
      step = System.IO.File.ReadAllText(file);
      if (!step.TrimStart().StartsWith("ISO-10303-21;") || !step.TrimEnd().EndsWith("END-ISO-10303-21;")) throw new System.Exception("Rhino returned an invalid STEP file");
    }
    string json = "{\"type\":" + quote(count == 0 ? "brep.clear" : "brep.update") + ",\"source\":" + quote(source) + ",\"label\":" + quote(label) + (step == null ? "" : ",\"step\":" + quote(step)) + "}";
    using (var timeout = new System.Threading.CancellationTokenSource(2500))
    using (var socket = new System.Net.WebSockets.ClientWebSocket())
    {
      socket.ConnectAsync(new System.Uri("ws://127.0.0.1:8765"), timeout.Token).GetAwaiter().GetResult();
      byte[] bytes = System.Text.Encoding.UTF8.GetBytes(json);
      socket.SendAsync(new System.ArraySegment<byte>(bytes), System.Net.WebSockets.WebSocketMessageType.Text, true, timeout.Token).GetAwaiter().GetResult();
      // Close the outgoing stream; Pathloom receives data without sending geometry back.
      socket.CloseOutputAsync(System.Net.WebSockets.WebSocketCloseStatus.NormalClosure, "sent", timeout.Token).GetAwaiter().GetResult();
    }
    Status = count == 0 ? "Cleared · " + source : "Sent " + count + " exact B-rep(s) · " + source;
  }
  catch (System.Exception error) { Status = "Pathloom: " + error.Message; }
  finally { if (file != null && System.IO.File.Exists(file)) System.IO.File.Delete(file); }
}
