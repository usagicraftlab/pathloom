// Grasshopper C# Script example for Pathloom Desktop.
// Inputs expected by RunScript:
//   Send   : bool
//   Source : string
//   Json   : string
// Output:
//   Status : string
//
// Json should contain the complete Pathloom toolpath.update payload.
// This minimal sender opens a local WebSocket, sends once, then closes.
// It is intentionally dependency-free and useful for validating the protocol first.

using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;

private void RunScript(bool Send, string Source, string Json, ref object Status)
{
  if (!Send)
  {
    Status = "Ready";
    return;
  }

  if (string.IsNullOrWhiteSpace(Json))
  {
    Status = "Json is empty";
    return;
  }

  try
  {
    using (var socket = new ClientWebSocket())
    {
      socket.ConnectAsync(new Uri("ws://127.0.0.1:8765"), CancellationToken.None)
        .GetAwaiter().GetResult();

      var bytes = Encoding.UTF8.GetBytes(Json);
      socket.SendAsync(
        new ArraySegment<byte>(bytes),
        WebSocketMessageType.Text,
        true,
        CancellationToken.None
      ).GetAwaiter().GetResult();

      socket.CloseAsync(
        WebSocketCloseStatus.NormalClosure,
        "Grasshopper update sent",
        CancellationToken.None
      ).GetAwaiter().GetResult();
    }

    Status = "Sent to Pathloom";
  }
  catch (Exception ex)
  {
    Status = "Pathloom connection failed: " + ex.Message;
  }
}
