-- Format host metrics for LogTide API
-- Transforms Fluent Bit CPU, memory, disk, and network metrics
-- into structured log records compatible with LogTide ingestion.

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
    -- sda1, sdb2, hda1, vda1 etc.
    if name:match("^[shv]d%a%d+$") then return true end
    -- nvme0n1p1, nvme0n1p2 etc.
    if name:match("^nvme%d+n%d+p%d+$") then return true end
    -- mmcblk0p1 etc.
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
-- Picks the whole-disk device with the highest total I/O operations
local function detect_disk_device()
    local content = read_file("/host/proc/diskstats") or read_file("/proc/diskstats")
    if not content then return "sda" end

    local best_device = nil
    local best_io = 0

    for line in content:gmatch("[^\n]+") do
        -- diskstats format: major minor name rd_ios ... wr_ios ...
        -- Fields: major minor name rd_ios rd_merges rd_sectors rd_ticks
        --         wr_ios wr_merges wr_sectors wr_ticks ...
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
-- Picks the interface with the highest total traffic (rx + tx bytes), skipping lo
local function detect_net_interface()
    local content = read_file("/host/proc/net/dev") or read_file("/proc/net/dev")
    if not content then return "eth0" end

    local best_iface = nil
    local best_traffic = 0

    for line in content:gmatch("[^\n]+") do
        -- Format: "  iface: rx_bytes rx_packets ... tx_bytes tx_packets ..."
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

-- Format bytes as a human-readable KB string
local function to_kb(bytes)
    if bytes == nil then return 0 end
    return round1(bytes / 1024)
end

-- Format CPU metrics
local function format_cpu(timestamp, record)
    local cpu_p = round1(record["cpu_p"] or 0)
    local user_p = round1(record["user_p"] or 0)
    local system_p = round1(record["system_p"] or 0)

    local level = "info"
    if cpu_p > 90 then
        level = "warn"
    end

    local message = string.format(
        "CPU usage: %.1f%% (user: %.1f%%, system: %.1f%%)",
        cpu_p, user_p, system_p
    )

    local metadata = {
        cpu_p = cpu_p,
        user_p = user_p,
        system_p = system_p,
        source = "fluent-bit-metrics"
    }

    -- Include per-core stats if available
    for k, v in pairs(record) do
        -- Per-core fields look like cpu0.p_cpu, cpu0.p_user, cpu0.p_system, etc.
        if type(k) == "string" and k:match("^cpu%d+") then
            metadata[k] = round1(v or 0)
        end
    end

    local new_record = {
        service = "host-cpu",
        level = level,
        message = message,
        time = os.date("!%Y-%m-%dT%H:%M:%SZ", timestamp),
        metadata = metadata
    }

    return new_record
end

-- Format memory metrics
local function format_mem(timestamp, record)
    local total = record["Mem.total"] or 0
    local used = record["Mem.used"] or 0
    local free = record["Mem.free"] or 0

    local usage_pct = 0
    if total > 0 then
        usage_pct = round1((used / total) * 100)
    end

    local total_mb = math.floor(total / 1024)
    local used_mb = math.floor(used / 1024)

    local level = "info"
    if usage_pct > 90 then
        level = "warn"
    end

    local message = string.format(
        "Memory usage: %.1f%% (%d MB used / %d MB total)",
        usage_pct, used_mb, total_mb
    )

    local swap_total = record["Swap.total"] or 0
    local swap_used = record["Swap.used"] or 0
    local swap_free = record["Swap.free"] or 0

    local new_record = {
        service = "host-memory",
        level = level,
        message = message,
        time = os.date("!%Y-%m-%dT%H:%M:%SZ", timestamp),
        metadata = {
            total_kb = total,
            used_kb = used,
            free_kb = free,
            usage_pct = usage_pct,
            swap_total_kb = swap_total,
            swap_used_kb = swap_used,
            swap_free_kb = swap_free,
            source = "fluent-bit-metrics"
        }
    }

    return new_record
end

-- Format disk I/O metrics
local function format_disk(timestamp, record)
    local device = cached_disk_device
    local read_size = record["read_size"] or 0
    local write_size = record["write_size"] or 0

    local read_kb = to_kb(read_size)
    local write_kb = to_kb(write_size)

    local message = string.format(
        "Disk I/O [%s]: read %.1f KB, write %.1f KB",
        device, read_kb, write_kb
    )

    local new_record = {
        service = "host-disk",
        level = "info",
        message = message,
        time = os.date("!%Y-%m-%dT%H:%M:%SZ", timestamp),
        metadata = {
            device = device,
            read_size_kb = read_kb,
            write_size_kb = write_kb,
            source = "fluent-bit-metrics"
        }
    }

    return new_record
end

-- Read network stats for a specific interface from /proc/net/dev
-- Returns a table with rx_bytes, tx_bytes, etc. or nil
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

-- Format network metrics
-- Reads /host/proc/net/dev directly (netif plugin can't see host interfaces from container)
local function format_net(timestamp, record)
    local iface = cached_net_interface
    local stats = read_net_stats(iface)

    if not stats then
        return {
            service = "host-network",
            level = "info",
            message = string.format("Network [%s]: no data available", iface),
            time = os.date("!%Y-%m-%dT%H:%M:%SZ", timestamp),
            metadata = { interface = iface, source = "fluent-bit-metrics" }
        }
    end

    -- Compute delta from previous reading for throughput
    local delta_rx = 0
    local delta_tx = 0
    if prev_net_stats then
        delta_rx = stats.rx_bytes - prev_net_stats.rx_bytes
        delta_tx = stats.tx_bytes - prev_net_stats.tx_bytes
        -- Handle counter wrap
        if delta_rx < 0 then delta_rx = 0 end
        if delta_tx < 0 then delta_tx = 0 end
    end
    prev_net_stats = stats

    local rx_kb = to_kb(delta_rx)
    local tx_kb = to_kb(delta_tx)

    local level = "info"
    if stats.rx_errors > 0 or stats.tx_errors > 0 then
        level = "warn"
    end

    local message = string.format(
        "Network [%s]: RX %.1f KB, TX %.1f KB (interval)",
        iface, rx_kb, tx_kb
    )

    local new_record = {
        service = "host-network",
        level = level,
        message = message,
        time = os.date("!%Y-%m-%dT%H:%M:%SZ", timestamp),
        metadata = {
            interface = iface,
            rx_bytes_delta = delta_rx,
            tx_bytes_delta = delta_tx,
            rx_bytes_total = stats.rx_bytes,
            tx_bytes_total = stats.tx_bytes,
            rx_packets = stats.rx_packets,
            tx_packets = stats.tx_packets,
            rx_errors = stats.rx_errors,
            tx_errors = stats.tx_errors,
            source = "fluent-bit-metrics"
        }
    }

    return new_record
end

-- Main entry point for Fluent Bit Lua filter
function format_metrics(tag, timestamp, record)
    ensure_detection()

    local new_record = nil

    if tag == "metrics.cpu" then
        new_record = format_cpu(timestamp, record)
    elseif tag == "metrics.mem" then
        new_record = format_mem(timestamp, record)
    elseif tag == "metrics.disk" then
        new_record = format_disk(timestamp, record)
    elseif tag == "metrics.net" then
        new_record = format_net(timestamp, record)
    else
        -- Unknown metric tag, pass through unchanged
        return 0, timestamp, record
    end

    -- Return code 1 = record modified and keep
    return 1, timestamp, new_record
end
