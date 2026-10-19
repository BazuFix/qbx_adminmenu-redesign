local config = require 'config.server'
local pedConfig = config.givePed

local function canUse(source)
    if not IsPlayerAceAllowed(source, config.eventPerms.givePed) then return false, 'ui.err_no_perms' end
    if not exports.qbx_core:IsOptin(source) then return false, 'error.not_optin' end
    return true
end

local function readIlleniumPeds()
    local src = LoadResourceFile('illenium-appearance', 'shared/peds.lua')
    if not src then return {} end

    local env = { Config = {} }
    local chunk = load(src, '@illenium-appearance/shared/peds.lua', 't', env)
    if not chunk or not pcall(chunk) then return {} end

    local out = {}
    local function collect(tbl, depth)
        if depth > 6 then return end
        for _, v in pairs(tbl) do
            if type(v) == 'string' then out[#out + 1] = v
            elseif type(v) == 'table' then collect(v, depth + 1) end
        end
    end
    collect(env.Config.Peds or {}, 0)
    return out
end

local pedList
local function getPedList()
    if pedList then return pedList end

    local seen, list = {}, {}
    local function add(name)
        if type(name) ~= 'string' then return end
        name = name:lower()
        if not seen[name] and name:match('^[%w_]+$') then
            seen[name] = true
            list[#list + 1] = name
        end
    end

    if pedConfig.readIllenium then
        for _, name in ipairs(readIlleniumPeds()) do add(name) end
    end
    for _, name in ipairs(pedConfig.extraPeds or {}) do add(name) end

    table.sort(list)
    pedList = list
    return pedList
end

lib.callback.register('qbx_admin:server:getPedList', function(source)
    local ok, err = canUse(source)
    if not ok then return false, err end
    return true, { peds = getPedList(), persistent = pedConfig.persistentDefault }
end)

lib.callback.register('qbx_admin:server:givePed', function(source, target, model, persistent)
    local ok, err = canUse(source)
    if not ok then return false, err end

    target = tonumber(target)
    if type(model) ~= 'string' then return false, 'ui.err_ped_invalid' end
    model = model:gsub('%s+', ''):lower()
    if not model:match('^[%w_]+$') or #model > 64 then return false, 'ui.err_ped_invalid' end
    if not target or not exports.qbx_core:GetPlayer(target) then return false, 'ui.err_offline' end

    local applied = lib.callback.await('qbx_admin:client:applyPed', target, model, persistent == true)
    if not applied then return false, 'ui.err_ped_invalid' end

    lib.print.info(('[PED] %s gave ped %s to %s [%s]%s'):format(GetPlayerName(source), model, GetPlayerName(target), target, persistent and ' (permanent)' or ''))
    return true
end)

AddEventHandler('onResourceStart', function(resource)
    if resource == 'illenium-appearance' then pedList = nil end
end)
