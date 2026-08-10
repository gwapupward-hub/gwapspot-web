const DEFAULT_GNS_PROFILE_BASE_URL = "https://gwapspot.fun";
const DEFAULT_GNS_PROFILE_PATH_TEMPLATE = "/name/{name}";

export function buildGnsPublicProfileUrl(
  name: string,
  options: { baseUrl?: string; pathTemplate?: string } = {},
) {
  const normalized = name.trim().toLowerCase().replace(/\.gwap$/, "");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(normalized)) {
    return null;
  }

  const base = (options.baseUrl || DEFAULT_GNS_PROFILE_BASE_URL).replace(/\/+$/, "");
  const configuredTemplate =
    options.pathTemplate || DEFAULT_GNS_PROFILE_PATH_TEMPLATE;
  const template = configuredTemplate.includes("{name}")
    ? configuredTemplate
    : DEFAULT_GNS_PROFILE_PATH_TEMPLATE;
  const path = template.replace("{name}", encodeURIComponent(normalized));
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
