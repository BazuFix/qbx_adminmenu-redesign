local config = require 'config.server'
local ckConfig = config.characterKill
local PERMANENT = 2147483647

local function canUse(source, permission)
    if not IsPlayerAceAllowed(source, permission) then return false, 'ui.err_no_perms' end
    if not exports.qbx_core:IsOptin(source) then return false, 'error.not_optin' end
    return true
end

local function safeDecode(str)
    if type(str) ~= 'string' then return {} end
    local ok, data = pcall(json.decode, str)
    return ok and type(data) == 'table' and data or {}
end

---@param target number | string
---@return { citizenid: string, name: string, src?: number, license?: string }?
local function findCharacter(target)
    local id = tonumber(target)
    if id then
        local player = exports.qbx_core:GetPlayer(id)
        if not player then return end
        local ci = player.PlayerData.charinfo
        return { citizenid = player.PlayerData.citizenid, name = ('%s %s'):format(ci.firstname, ci.lastname), src = id, license = player.PlayerData.license }
    end

    if type(target) ~= 'string' or target == '' then return end
    local citizenid = target:upper()
    local player = exports.qbx_core:GetPlayerByCitizenId(citizenid)
    if player then
        local ci = player.PlayerData.charinfo
        return { citizenid = citizenid, name = ('%s %s'):format(ci.firstname, ci.lastname), src = player.PlayerData.source, license = player.PlayerData.license }
    end

    if not ckConfig.allowOffline then return end
    local row = MySQL.single.await('SELECT charinfo, license FROM players WHERE citizenid = ?', { citizenid })
    if not row then return end
    local ci = safeDecode(row.charinfo)
    return { citizenid = citizenid, name = ('%s %s'):format(ci.firstname or '?', ci.lastname or '?'), license = row.license }
end

lib.callback.register('qbx_admin:server:ckLookup', function(source, target)
    local ok, err = canUse(source, config.eventPerms.characterKill)
    if not ok then return false, err end

    local char = findCharacter(target)
    if not char then return false, 'ui.err_char_not_found' end
    return true, { citizenid = char.citizenid, name = char.name, online = char.src ~= nil, id = char.src }
end)

lib.callback.register('qbx_admin:server:ckExecute', function(source, citizenid)
    local ok, err = canUse(source, config.eventPerms.characterKill)
    if not ok then return false, err end

    local char = findCharacter(citizenid)
    if not char then return false, 'ui.err_char_not_found' end

    local online = exports.qbx_core:GetPlayerByCitizenId(char.citizenid)
    if online then
        DropPlayer(tostring(online.PlayerData.source), ckConfig.dropMessage)
        Wait(1000)
    end

    exports.qbx_core:DeleteCharacter(char.citizenid)
    lib.print.info(('[CK] %s (%s) deleted character %s (%s)'):format(GetPlayerName(source), GetPlayerIdentifierByType(source, 'license') or '?', char.name, char.citizenid))
    return true, char.name
end)

local function onlineCitizenIds()
    local set = {}
    for _, player in pairs(exports.qbx_core:GetQBPlayers()) do set[player.PlayerData.citizenid] = true end
    return set
end

local function parseOfflineRow(row)
    local ci, money, job, gang = safeDecode(row.charinfo), safeDecode(row.money), safeDecode(row.job), safeDecode(row.gang)
    return {
        citizenid = row.citizenid,
        license = row.license,
        playerName = row.name,
        name = ('%s %s'):format(ci.firstname or '?', ci.lastname or ''),
        phone = ci.phone,
        cash = tonumber(money.cash) or 0,
        bank = tonumber(money.bank) or 0,
        job = job.label and ('%s | %s'):format(job.label, type(job.grade) == 'table' and (job.grade.name or job.grade.level) or job.grade or 0) or '-',
        gang = gang.label or '-',
        lastSeen = row.last_seen,
    }
end

lib.callback.register('qbx_admin:server:getOfflinePlayers', function(source, search)
    local ok, err = canUse(source, config.eventPerms.offlinePlayers)
    if not ok then return false, err end

    local query = 'SELECT citizenid, license, name, charinfo, money, job, gang, UNIX_TIMESTAMP(last_updated) AS last_seen FROM players'
    local params = {}
    if type(search) == 'string' and search:gsub('%s', '') ~= '' then
        local like = '%' .. search:gsub('[%%_]', '') .. '%'
        query = query .. ' WHERE citizenid LIKE ? OR license LIKE ? OR name LIKE ? OR charinfo LIKE ?'
        params = { like, like, like, like }
    end
    query = query .. ' ORDER BY last_updated DESC LIMIT 150'

    local online = onlineCitizenIds()
    local list = {}
    for _, row in ipairs(MySQL.query.await(query, params) or {}) do
        if not online[row.citizenid] then list[#list + 1] = parseOfflineRow(row) end
    end
    return true, list
end)

local function getOfflineRow(citizenid)
    if type(citizenid) ~= 'string' then return nil, 'ui.err_char_not_found' end
    if exports.qbx_core:GetPlayerByCitizenId(citizenid) then return nil, 'ui.err_now_online' end
    local row = MySQL.single.await('SELECT citizenid, license, name, charinfo, money, job, gang, UNIX_TIMESTAMP(last_updated) AS last_seen FROM players WHERE citizenid = ?', { citizenid })
    if not row then return nil, 'ui.err_char_not_found' end
    return row
end

lib.callback.register('qbx_admin:server:getOfflinePlayer', function(source, citizenid)
    local ok, err = canUse(source, config.eventPerms.offlinePlayers)
    if not ok then return false, err end
    local row, rowErr = getOfflineRow(citizenid)
    if not row then return false, rowErr end
    return true, parseOfflineRow(row)
end)

lib.callback.register('qbx_admin:server:offlineSetMoney', function(source, citizenid, moneyType, amount)
    local ok, err = canUse(source, config.eventPerms.changePlayerData)
    if not ok then return false, err end
    amount = math.floor(tonumber(amount) or -1)
    if (moneyType ~= 'cash' and moneyType ~= 'bank') or amount < 0 then return false end

    local row, rowErr = getOfflineRow(citizenid)
    if not row then return false, rowErr end

    local money = safeDecode(row.money)
    local old = money[moneyType]
    money[moneyType] = amount
    MySQL.update.await('UPDATE players SET money = ? WHERE citizenid = ?', { json.encode(money), citizenid })
    lib.print.info(('[OFFLINE] %s set %s %s: %s -> %s'):format(GetPlayerName(source), citizenid, moneyType, old, amount))
    return true
end)

lib.callback.register('qbx_admin:server:offlineBan', function(source, citizenid, data)
    local ok, err = canUse(source, config.eventPerms.ban)
    if not ok then return false, err end
    if type(data) ~= 'table' or type(data.reason) ~= 'string' or data.reason == '' then return false end

    local row, rowErr = getOfflineRow(citizenid)
    if not row then return false, rowErr end

    local expire = data.permanent and PERMANENT
        or os.time() + (tonumber(data.hours) or 0) * 3600 + (tonumber(data.days) or 0) * 86400 + (tonumber(data.months) or 0) * 2629743
    if expire <= os.time() then return false, 'ui.err_ban_time' end

    MySQL.insert.await('INSERT INTO bans (name, license, reason, expire, bannedby) VALUES (?, ?, ?, ?, ?)', {
        row.name, row.license, data.reason, expire, GetPlayerName(source)
    })
    lib.print.info(('[OFFLINE BAN] %s banned %s (%s / %s)'):format(GetPlayerName(source), row.name, citizenid, row.license))
    return true
end)

lib.callback.register('qbx_admin:server:getBans', function(source)
    local ok, err = canUse(source, config.eventPerms.bans)
    if not ok then return false, err end

    local rows = MySQL.query.await('SELECT id, name, license, discord, ip, reason, expire, bannedby FROM bans ORDER BY id DESC') or {}
    local now = os.time()
    for i = 1, #rows do
        local row = rows[i]
        row.ip = nil
        row.permanent = (row.expire or 0) >= PERMANENT - 86400
        row.active = row.permanent or (row.expire or 0) > now
    end
    return true, { bans = rows, now = now }
end)

lib.callback.register('qbx_admin:server:unban', function(source, banId)
    local ok, err = canUse(source, config.eventPerms.bans)
    if not ok then return false, err end

    banId = tonumber(banId)
    if not banId then return false end
    local row = MySQL.single.await('SELECT name, license FROM bans WHERE id = ?', { banId })
    if not row then return false, 'ui.err_ban_not_found' end

    MySQL.query.await('DELETE FROM bans WHERE id = ?', { banId })
    lib.print.info(('[UNBAN] %s removed ban #%s (%s / %s)'):format(GetPlayerName(source), banId, row.name, row.license))
    return true, row.name
end)
