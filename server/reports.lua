local config = require 'config.server'
local reportConfig = config.reports
local staffPerm = config.commandPerms.reportReply

---@type table<number, table>
local REPORTS = {}
local reportsCount = 0
local messageCount = 0
local lastReportAt = {}

local function getLicense(src)
    return GetPlayerIdentifierByType(src, 'license') or ('src:' .. src)
end

local function getCharName(src)
    local player = exports.qbx_core:GetPlayer(src)
    if not player then return GetPlayerName(src) or ('#' .. src) end
    local charinfo = player.PlayerData.charinfo
    return ('%s %s'):format(charinfo.firstname, charinfo.lastname)
end

local function findSourceByLicense(license)
    for _, src in ipairs(GetPlayers()) do
        src = tonumber(src) --[[@as number]]
        if getLicense(src) == license then return src end
    end
end

local function isStaff(src)
    return IsPlayerAceAllowed(src, staffPerm) and exports.qbx_core:IsOptin(src)
end

local function cleanText(text, max)
    if type(text) ~= 'string' then return nil end
    text = text:gsub('^%s+', ''):gsub('%s+$', '')
    if text == '' then return nil end
    if #text > max then text = text:sub(1, max) end
    return text
end

local function serialize(report)
    local senderSrc = findSourceByLicense(report.senderLicense)
    report.senderId = senderSrc or report.senderId
    return {
        id = report.id,
        type = report.type,
        category = report.category,
        subject = report.subject,
        status = report.status,
        senderId = report.senderId,
        senderName = report.senderName,
        senderChar = report.senderChar,
        senderOnline = senderSrc ~= nil,
        claimedBy = report.claimedBy,
        createdAt = report.createdAt,
        updatedAt = report.updatedAt,
        closedAt = report.closedAt,
        rating = report.rating,
        messages = report.messages,
    }
end

---@param report table
---@param meta table { kind = 'new' | 'message' | 'status', by = string?, fromStaff = boolean? }
local function push(report, meta)
    local data = serialize(report)

    if data.senderOnline then
        TriggerClientEvent('qbx_admin:client:reportSync', data.senderId, data, meta, false)
    end

    OnAdmin(staffPerm, function(target)
        TriggerClientEvent('qbx_admin:client:reportSync', target.PlayerData.source, data, meta, true)
    end)
end

local function addMessage(report, from, name, text, authorId)
    messageCount += 1
    local message = {
        id = messageCount,
        from = from,
        name = name,
        authorId = authorId,
        text = text,
        time = os.time(),
    }
    report.messages[#report.messages + 1] = message
    report.updatedAt = message.time
    return message
end

local function countOpen(license)
    local count = 0
    for _, report in pairs(REPORTS) do
        if report.senderLicense == license and report.status ~= 'closed' then
            count += 1
        end
    end
    return count
end

local function createReport(targetSrc, data, reportType)
    reportsCount += 1
    local now = os.time()
    local report = {
        id = reportsCount,
        type = reportType or 'report',
        category = data.category or 'general',
        subject = data.subject,
        status = 'open',
        senderId = targetSrc,
        senderLicense = getLicense(targetSrc),
        senderName = GetPlayerName(targetSrc),
        senderChar = getCharName(targetSrc),
        createdAt = now,
        updatedAt = now,
        messages = {},
    }
    REPORTS[report.id] = report
    return report
end

local function sortedList(filter)
    local list = {}
    for _, report in pairs(REPORTS) do
        if not filter or filter(report) then
            list[#list + 1] = serialize(report)
        end
    end
    table.sort(list, function(a, b) return a.updatedAt > b.updatedAt end)
    return list
end

---@param source number
---@param data { category: string?, subject: string?, message: string }
function SendReport(source, data)
    if type(data) == 'string' then data = { message = data } end
    local message = cleanText(data.message, reportConfig.maxMessageLength)
    if not message then return nil, 'ui.err_empty' end

    local now = os.time()
    if lastReportAt[source] and now - lastReportAt[source] < reportConfig.cooldown then
        return nil, 'ui.err_cooldown'
    end

    if countOpen(getLicense(source)) >= reportConfig.maxOpenPerPlayer then
        return nil, 'ui.err_max_open'
    end

    lastReportAt[source] = now
    local subject = cleanText(data.subject, 60) or message:sub(1, 40)
    local report = createReport(source, { category = cleanText(data.category, 32), subject = subject })
    addMessage(report, 'player', report.senderChar, message, source)

    exports.qbx_core:Notify(source, locale('success.report_sent'), 'success')
    push(report, { kind = 'new', by = report.senderChar })

    return serialize(report)
end

lib.callback.register('qbx_admin:server:createReport', function(source, data)
    if type(data) ~= 'table' then return false end
    local report, err = SendReport(source, data)
    if not report then return false, err end
    return true, report
end)

lib.callback.register('qbx_admin:server:getMyReports', function(source)
    local license = getLicense(source)
    return sortedList(function(report) return report.senderLicense == license end)
end)

lib.callback.register('qbx_admin:server:getReports', function(source)
    if not isStaff(source) then return false end
    return sortedList()
end)

lib.callback.register('qbx_admin:server:sendReportMessage', function(source, id, text)
    local report = REPORTS[tonumber(id)]
    if not report then return false, 'ui.err_not_found' end

    text = cleanText(text, reportConfig.maxMessageLength)
    if not text then return false, 'ui.err_empty' end

    local isOwner = report.senderLicense == getLicense(source)
    local staff = isStaff(source)

    if report.status == 'closed' then return false, 'ui.err_closed' end

    if isOwner and not staff then
        addMessage(report, 'player', getCharName(source), text, source)
        push(report, { kind = 'message', by = getCharName(source), fromStaff = false })
        return true
    end

    if not staff then return false, 'ui.err_no_perms' end

    local name = GetPlayerName(source)
    addMessage(report, 'staff', name, text, source)

    if not report.claimedBy then
        report.claimedBy = { id = source, name = name }
        report.status = 'claimed'
        OnAdmin(staffPerm, function(target)
            exports.qbx_core:Notify(target.PlayerData.source, locale('success.report_claimed_by', report.id, name), 'inform')
        end)
    end

    push(report, { kind = 'message', by = name, fromStaff = true })
    return true
end)

RegisterNetEvent('qbx_admin:server:reportTyping', function(id)
    local src = source
    local report = REPORTS[tonumber(id)]
    if not report or report.status == 'closed' then return end

    local isOwner = report.senderLicense == getLicense(src)
    if isOwner and not isStaff(src) then
        OnAdmin(staffPerm, function(target)
            TriggerClientEvent('qbx_admin:client:reportTyping', target.PlayerData.source, report.id, getCharName(src))
        end)
    elseif isStaff(src) then
        local senderSrc = findSourceByLicense(report.senderLicense)
        if senderSrc then
            TriggerClientEvent('qbx_admin:client:reportTyping', senderSrc, report.id, GetPlayerName(src))
        end
    end
end)

local staffActions = {
    claim = function(report, source)
        report.claimedBy = { id = source, name = GetPlayerName(source) }
        report.status = 'claimed'
        addMessage(report, 'system', 'system', ('claimed:%s'):format(GetPlayerName(source)))
        OnAdmin(staffPerm, function(target)
            exports.qbx_core:Notify(target.PlayerData.source, locale('success.report_claimed_by', report.id, GetPlayerName(source)), 'inform')
        end)
    end,
    unclaim = function(report)
        report.claimedBy = nil
        report.status = 'open'
        addMessage(report, 'system', 'system', 'unclaimed')
    end,
    close = function(report, source)
        report.status = 'closed'
        report.closedAt = os.time()
        addMessage(report, 'system', 'system', ('closed:%s'):format(GetPlayerName(source)))
    end,
    reopen = function(report, source)
        report.status = report.claimedBy and 'claimed' or 'open'
        report.closedAt = nil
        addMessage(report, 'system', 'system', ('reopened:%s'):format(GetPlayerName(source)))
    end,
    ['goto'] = function(report, source)
        local target = findSourceByLicense(report.senderLicense)
        if not target then return false, 'ui.err_offline' end
        local coords = GetEntityCoords(GetPlayerPed(target))
        CheckRoutingbucket(source, target)
        SetEntityCoords(GetPlayerPed(source), coords.x, coords.y, coords.z, false, false, false, false)
        return true, nil, true
    end,
    bring = function(report, source)
        local target = findSourceByLicense(report.senderLicense)
        if not target then return false, 'ui.err_offline' end
        local coords = GetEntityCoords(GetPlayerPed(source))
        CheckRoutingbucket(target, source)
        SetEntityCoords(GetPlayerPed(target), coords.x, coords.y, coords.z, false, false, false, false)
        return true, nil, true
    end,
    delete = function(report)
        REPORTS[report.id] = nil
        local senderSrc = findSourceByLicense(report.senderLicense)
        if senderSrc then TriggerClientEvent('qbx_admin:client:reportRemoved', senderSrc, report.id) end
        OnAdmin(staffPerm, function(target)
            TriggerClientEvent('qbx_admin:client:reportRemoved', target.PlayerData.source, report.id)
        end)
        return true, nil, true
    end,
}

lib.callback.register('qbx_admin:server:reportAction', function(source, id, action)
    local report = REPORTS[tonumber(id)]
    if not report then return false, 'ui.err_not_found' end

    local isOwner = report.senderLicense == getLicense(source)

    if not isStaff(source) then
        if not isOwner then return false, 'ui.err_no_perms' end
        if action ~= 'close' or report.status == 'closed' then return false, 'ui.err_no_perms' end
        report.status = 'closed'
        report.closedAt = os.time()
        addMessage(report, 'system', 'system', 'closed_by_player')
        push(report, { kind = 'status', by = getCharName(source) })
        return true
    end

    local handler = staffActions[action]
    if not handler then return false end

    local ok, err, silent = handler(report, source)
    if ok == false then return false, err end
    if not silent then
        push(report, { kind = 'status', by = GetPlayerName(source), fromStaff = true })
    end
    return true
end)

lib.callback.register('qbx_admin:server:rateReport', function(source, id, stars)
    local report = REPORTS[tonumber(id)]
    stars = math.floor(tonumber(stars) or 0)
    if not report or report.senderLicense ~= getLicense(source) or report.status ~= 'closed' then return false end
    if stars < 1 or stars > 5 then return false end
    report.rating = stars
    push(report, { kind = 'rating', by = getCharName(source) })
    return true
end)

lib.callback.register('qbx_admin:server:startDM', function(source, targetId, text)
    if not IsPlayerAceAllowed(source, reportConfig.startDmPerm) or not exports.qbx_core:IsOptin(source) then
        return false, 'ui.err_no_perms'
    end

    targetId = tonumber(targetId)
    if not targetId or not GetPlayerName(targetId) then return false, 'ui.err_offline' end

    text = cleanText(text, reportConfig.maxMessageLength)
    if not text then return false, 'ui.err_empty' end

    local name = GetPlayerName(source)
    local report = createReport(targetId, { category = 'dm', subject = ('DM · %s'):format(name) }, 'dm')
    report.claimedBy = { id = source, name = name }
    report.status = 'claimed'
    addMessage(report, 'staff', name, text, source)

    push(report, { kind = 'new', by = name, fromStaff = true })
    return true, serialize(report)
end)

function GetReportStats()
    local stats = { open = 0, claimed = 0, closed = 0, total = 0 }
    for _, report in pairs(REPORTS) do
        stats[report.status] += 1
        stats.total += 1
    end
    return stats
end

AddEventHandler('playerDropped', function()
    local src = source
    lastReportAt[src] = nil
    for _, report in pairs(REPORTS) do
        if report.claimedBy and report.claimedBy.id == src and report.status == 'claimed' then
            report.claimedBy = nil
            report.status = 'open'
            addMessage(report, 'system', 'system', 'staff_left')
            push(report, { kind = 'status' })
        end
    end
end)

CreateThread(function()
    while true do
        Wait(60000)
        local now = os.time()
        for id, report in pairs(REPORTS) do
            if report.status == 'closed' and report.closedAt and now - report.closedAt > reportConfig.keepClosedFor then
                REPORTS[id] = nil
            end
        end
    end
end)
