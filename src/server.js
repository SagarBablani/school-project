import { createApp } from "./app.js";

const PORT = Number(process.env.PORT || 4001);
const app = createApp();

app.listen(PORT, () => {
  console.log(`School Ops Agent Platform running at http://127.0.0.1:${PORT}`);
});
