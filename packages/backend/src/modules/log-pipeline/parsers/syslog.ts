const RFC3164 = /^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+?)(?:\[(\d+)\])?:\s+(.*)/;
const RFC5424 = /^<(\d+)>(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)/;

export function parseSyslog(message: string): Record<string, unknown> | null {
  // Try RFC 5424 first (has version number after priority)
  const m5424 = RFC5424.exec(message);
  if (m5424) {
    const [, priority, , timestamp, hostname, appname, pid, , , msg] = m5424;
    return {
      priority: parseInt(priority, 10),
      facility: Math.floor(parseInt(priority, 10) / 8),
      severity: parseInt(priority, 10) % 8,
      timestamp,
      hostname: hostname === '-' ? undefined : hostname,
      appname: appname === '-' ? undefined : appname,
      pid: pid !== '-' ? parseInt(pid, 10) : undefined,
      syslog_message: msg,
    };
  }

  // Try RFC 3164
  const m3164 = RFC3164.exec(message);
  if (m3164) {
    const [, timestamp, hostname, appname, pid, msg] = m3164;
    return {
      timestamp,
      hostname,
      appname,
      ...(pid ? { pid: parseInt(pid, 10) } : {}),
      syslog_message: msg,
    };
  }

  return null;
}
