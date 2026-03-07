-- Format host metrics as OTLP gauge data points for LogTide Metrics Explorer
-- Transforms Fluent Bit CPU, memory, disk, and network metrics
-- into OTLP ExportMetricsServiceRequest JSON.

-- Cached device names (detected once on first metric)
local cached_disk_device = nil
local cached_net_interface = nil
local detection_done = false

-- Try to read a file, return contents or nil
local function read_file(path)
    local f = io.open(path, "r")
    if not f then return nil end
    local content = f:read("*a")
    f:close()
    return content
end

-- Check if a device name looks like a partition (sda1, nvme0n1p1, etc.)
local function is_partition(name)
    if name:match("^[shv]d%a%d+$") then return true end
    if name:match("^nvme%d+n%d+p%d+$") then return true end
    if name:match("^mmcblk%d+p%d+$") then return true end
    return false
end

-- Check if a device should be skipped entirely
local function is_skip_device(name)
    if name:match("^loop%d+$") then return true end
    if name:match("^dm%-") then return true end
    if name:match("^ram%d+$") then return true end
    return false
end

-- Detect the primary disk device by reading /proc/diskstats
local function detect_disk_device()
    local content = read_file("/host/proc/diskstats") or read_file("/proc/diskstats")
    if not content then return "sda" end

    local best_device = nil
    local best_io = 0

    for line in content:gmatch("[^\n]+") do
        local fields = {}
        for field in line:gmatch("%S+") do
            fields[#fields + 1] = field
        end

        if #fields >= 7 then
            local name = fields[3]
            local rd_ios = tonumber(fields[4]) or 0
            local wr_ios = tonumber(fields[8]) or 0
            local total_io = rd_ios + wr_ios

            if not is_skip_device(name) and not is_partition(name) and total_io > best_io then
                best_io = total_io
                best_device = name
            end
        end
    end

    return best_device or "sda"
end

-- Detect the primary network interface by reading /proc/net/dev
local function detect_net_interface()
    local content = read_file("/host/proc/net/dev") or read_file("/proc/net/dev")
    if not content then return "eth0" end

    local best_iface = nil
    local best_traffic = 0

    for line in content:gmatch("[^\n]+") do
        local iface, rest = line:match("^%s*(%S+):%s*(.*)")
        if iface and iface ~= "lo" then
            local fields = {}
            for field in rest:gmatch("%S+") do
                fields[#fields + 1] = field
            end

            if #fields >= 9 then
                local rx_bytes = tonumber(fields[1]) or 0
                local tx_bytes = tonumber(fields[9]) or 0
                local total = rx_bytes + tx_bytes

                if total > best_traffic then
                    best_traffic = total
                    best_iface = iface
                end
            end
        end
    end

    return best_iface or "eth0"
end

-- Run detection once and cache results
local function ensure_detection()
    if detection_done then return end
    cached_disk_device = detect_disk_device()
    cached_net_interface = detect_net_interface()
    detection_done = true
end

-- Round a number to one decimal place
local function round1(n)
    if n == nil then return 0 end
    return math.floor(n * 10 + 0.5) / 10
end

-- Read network stats for a specific interface from /proc/net/dev
local function read_net_stats(iface)
    local content = read_file("/host/proc/net/dev") or read_file("/proc/net/dev")
    if not content then return nil end

    for line in content:gmatch("[^\n]+") do
        local name, rest = line:match("^%s*(%S+):%s*(.*)")
        if name == iface then
            local fields = {}
            for field in rest:gmatch("%S+") do
                fields[#fields + 1] = tonumber(field) or 0
            end
            if #fields >= 12 then
                return {
                    rx_bytes = fields[1],
                    rx_packets = fields[2],
                    rx_errors = fields[3],
                    tx_bytes = fields[9],
                    tx_packets = fields[10],
                    tx_errors = fields[12]
                }
            end
        end
    end
    return nil
end

-- Previous network stats for delta computation
local prev_net_stats = nil

-- Convert a Unix timestamp (seconds) to nanoseconds string for OTLP
local function ts_to_nanos(ts)
    return tostring(ts) .. "000000000"
end

-- Build an OTLP gauge metric JSON string
-- metrics_list: array of {name, value, unit, description, attributes}
-- service_name: resource-level service name
-- timestamp: unix timestamp in seconds
local function build_otlp_json(metrics_list, service_name, timestamp)
    local ts_ns = ts_to_nanos(timestamp)

    -- Build metrics array
    local metrics_parts = {}
    for _, m in ipairs(metrics_list) do
        -- Build attributes array for the data point
        local dp_attrs = ""
        if m.attributes and #m.attributes > 0 then
            local attr_parts = {}
            for _, a in ipairs(m.attributes) do
                attr_parts[#attr_parts + 1] = string.format(
                    '{"key":"%s","value":{"stringValue":"%s"}}',
                    a.key, a.value
                )
            end
            dp_attrs = ',"attributes":[' .. table.concat(attr_parts, ",") .. ']'
        end

        metrics_parts[#metrics_parts + 1] = string.format(
            '{"name":"%s","description":"%s","unit":"%s","gauge":{"dataPoints":[{"timeUnixNano":"%s","asDouble":%s%s}]}}',
            m.name,
            m.description or "",
            m.unit or "",
            ts_ns,
            tostring(m.value),
            dp_attrs
        )
    end

    return '{"resourceMetrics":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"' ..
        service_name ..
        '"}},{"key":"host.type","value":{"stringValue":"system"}}]},"scopeMetrics":[{"scope":{"name":"fluent-bit-metrics","version":"1.0.0"},"metrics":[' ..
        table.concat(metrics_parts, ",") ..
        ']}]}]}'
end

-- Main entry point for Fluent Bit Lua filter
function format_metrics(tag, timestamp, record)
    ensure_detection()

    local metrics = {}
    local service_name = "host-system"

    if tag == "metrics.cpu" then
        local cpu_p = round1(record["cpu_p"] or 0)
        local user_p = round1(record["user_p"] or 0)
        local system_p = round1(record["system_p"] or 0)

        metrics[#metrics + 1] = {
            name = "system.cpu.utilization",
            description = "Total CPU utilization",
            unit = "%",
            value = cpu_p,
            attributes = {}
        }
        metrics[#metrics + 1] = {
            name = "system.cpu.user",
            description = "User CPU utilization",
            unit = "%",
            value = user_p,
            attributes = {}
        }
        metrics[#metrics + 1] = {
            name = "system.cpu.system",
            description = "System CPU utilization",
            unit = "%",
            value = system_p,
            attributes = {}
        }

    elseif tag == "metrics.mem" then
        local total = record["Mem.total"] or 0
        local used = record["Mem.used"] or 0
        local free = record["Mem.free"] or 0
        local usage_pct = 0
        if total > 0 then
            usage_pct = round1((used / total) * 100)
        end

        metrics[#metrics + 1] = {
            name = "system.memory.utilization",
            description = "Memory utilization",
            unit = "%",
            value = usage_pct,
            attributes = {}
        }
        metrics[#metrics + 1] = {
            name = "system.memory.usage",
            description = "Memory used",
            unit = "MB",
            value = math.floor(used / 1024),
            attributes = {}
        }
        metrics[#metrics + 1] = {
            name = "system.memory.total",
            description = "Total memory",
            unit = "MB",
            value = math.floor(total / 1024),
            attributes = {}
        }

        local swap_total = record["Swap.total"] or 0
        local swap_used = record["Swap.used"] or 0
        if swap_total > 0 then
            metrics[#metrics + 1] = {
                name = "system.swap.utilization",
                description = "Swap utilization",
                unit = "%",
                value = round1((swap_used / swap_total) * 100),
                attributes = {}
            }
        end

    elseif tag == "metrics.disk" then
        local device = cached_disk_device
        local read_size = record["read_size"] or 0
        local write_size = record["write_size"] or 0

        metrics[#metrics + 1] = {
            name = "system.disk.read",
            description = "Disk read throughput",
            unit = "KB",
            value = round1(read_size / 1024),
            attributes = {
                {key = "device", value = device}
            }
        }
        metrics[#metrics + 1] = {
            name = "system.disk.write",
            description = "Disk write throughput",
            unit = "KB",
            value = round1(write_size / 1024),
            attributes = {
                {key = "device", value = device}
            }
        }

    elseif tag == "metrics.net" then
        local iface = cached_net_interface
        local stats = read_net_stats(iface)

        if not stats then
            return 0, timestamp, record
        end

        -- Compute delta from previous reading
        local delta_rx = 0
        local delta_tx = 0
        if prev_net_stats then
            delta_rx = stats.rx_bytes - prev_net_stats.rx_bytes
            delta_tx = stats.tx_bytes - prev_net_stats.tx_bytes
            if delta_rx < 0 then delta_rx = 0 end
            if delta_tx < 0 then delta_tx = 0 end
        end
        prev_net_stats = stats

        metrics[#metrics + 1] = {
            name = "system.network.rx",
            description = "Network received (interval)",
            unit = "KB",
            value = round1(delta_rx / 1024),
            attributes = {
                {key = "interface", value = iface}
            }
        }
        metrics[#metrics + 1] = {
            name = "system.network.tx",
            description = "Network transmitted (interval)",
            unit = "KB",
            value = round1(delta_tx / 1024),
            attributes = {
                {key = "interface", value = iface}
            }
        }
        metrics[#metrics + 1] = {
            name = "system.network.rx.errors",
            description = "Network receive errors",
            unit = "errors",
            value = stats.rx_errors,
            attributes = {
                {key = "interface", value = iface}
            }
        }
        metrics[#metrics + 1] = {
            name = "system.network.tx.errors",
            description = "Network transmit errors",
            unit = "errors",
            value = stats.tx_errors,
            attributes = {
                {key = "interface", value = iface}
            }
        }

    else
        return 0, timestamp, record
    end

    if #metrics == 0 then
        return 0, timestamp, record
    end

    -- Build OTLP JSON payload
    local json = build_otlp_json(metrics, service_name, timestamp)

    -- Replace the record with the OTLP payload + headers
    local new_record = {
        otlp_payload = json,
        otlp_headers = {
            ["Content-Type"] = "application/json"
        }
    }

    return 1, timestamp, new_record
end
