// Standard nginx combined log format:
// $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
const NGINX_REGEX = /^(\S+) \S+ (\S+) \[([^\]]+)\] "(\S+) ([^"]*?) (HTTP\/[\d.]+)" (\d{3}) (\d+) "([^"]*)" "([^"]*)"/;

export function parseNginx(message: string): Record<string, unknown> | null {
  const m = NGINX_REGEX.exec(message);
  if (!m) return null;

  const [, clientIp, remoteUser, timeLocal, method, rawPath, httpVersion, status, bytes, referer, userAgent] = m;

  const [path, query] = rawPath.split('?');

  return {
    client_ip: clientIp,
    remote_user: remoteUser,
    timestamp: timeLocal,
    http_method: method,
    http_path: path,
    ...(query ? { http_query: query } : {}),
    http_version: httpVersion.replace('HTTP/', ''),
    http_status: parseInt(status, 10),
    response_bytes: parseInt(bytes, 10),
    http_referer: referer,
    user_agent: userAgent,
  };
}
