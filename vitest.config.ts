import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // tsconfig.json의 "@/*" 경로 별칭을 vitest(esbuild/vite 번들러)에서도
    // 그대로 쓸 수 있게 해준다. tsc/next는 tsconfig의 paths를 자체적으로
    // 처리하지만, vitest는 별도로 알려줘야 한다.
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
