export function handleEvents(req, res) {
  const { sseClients } = req.app.locals;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  const client = { res, schoolId: req.user.schoolId };
  sseClients.add(client);
  res.write("event: connected\ndata: {}\n\n");
  req.on("close", () => sseClients.delete(client));
}
