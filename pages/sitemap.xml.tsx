import { GetServerSideProps } from "next";
const Sitemap = () => null;
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const pages = ["","/scope-extractor","/how-it-works","/schema","/blog","/blog/missing-scope-construction","/blog/rfi-examples-construction","/blog/millwork-estimating-checklist","/examples/millwork-plan-review"];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(p => `<url><loc>https://projmgt.ai${p}</loc><changefreq>weekly</changefreq><priority>${p===""?"1.0":"0.8"}</priority></url>`).join("")}</urlset>`;
  res.setHeader("Content-Type","text/xml");
  res.write(sitemap);
  res.end();
  return { props: {} };
};
export default Sitemap;
