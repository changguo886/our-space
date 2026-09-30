import type { MetadataRoute } from "next";

// 私人空间：告诉所有爬虫不要抓取
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
