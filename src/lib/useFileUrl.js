import { useEffect, useState } from "react";
import { signFileUrl } from "./api";

// Private files need short-lived signed URLs. Cache them so each file is signed once per ~50 min.
const cache = new Map(); // path -> { url, expires } | Promise

const getUrl = (path) => {
  const hit = cache.get(path);
  if (hit instanceof Promise) return hit;
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.url);
  const p = signFileUrl(path)
    .then((url) => {
      cache.set(path, { url, expires: Date.now() + 50 * 60_000 });
      return url;
    })
    .catch((err) => {
      cache.delete(path);
      throw err;
    });
  cache.set(path, p);
  return p;
};

/** URL for a message's file: the local preview while uploading, otherwise a signed URL. */
export const useFileUrl = (message) => {
  const { localUrl, filePath } = message ?? {};
  const [url, setUrl] = useState(() => {
    if (localUrl) return localUrl;
    const hit = filePath && cache.get(filePath);
    return hit && !(hit instanceof Promise) && hit.expires > Date.now() ? hit.url : null;
  });

  useEffect(() => {
    if (localUrl) return setUrl(localUrl);
    if (!filePath) return;
    let alive = true;
    getUrl(filePath)
      .then((u) => alive && setUrl(u))
      .catch((e) => console.error("Could not load file", e));
    return () => {
      alive = false;
    };
  }, [localUrl, filePath]);

  return url;
};
