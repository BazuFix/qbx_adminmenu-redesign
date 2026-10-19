Actions = Actions or {}

local weathers = {
    Extrasunny = true, Clear = true, Neutral = true, Smog = true, Foggy = true, Overcast = true, Clouds = true, Clearing = true,
    Rain = true, Thunder = true, Snow = true, Blizzard = true, Snowlight = true, Xmas = true, Halloween = true,
}

Actions['server:weather'] = function(data)
    if not data or not weathers[data.weather] then return false end
    TriggerServerEvent('qb-weathersync:server:setWeather', data.weather)
    return true
end

Actions['server:time'] = function(data)
    local hour = tonumber(data and data.hour)
    if not hour or hour < 0 or hour > 23 then return false end
    TriggerServerEvent('qb-weathersync:server:setTime', ('%02d'):format(math.floor(hour)), ('%02d'):format(math.floor(tonumber(data.minute) or 0)))
    return true
end

Actions['server:radio'] = function(data)
    local frequency = tonumber(data and data.frequency)
    if not frequency then return false end
    local players = lib.callback.await('qbx_admin:callback:getradiolist', false, frequency)
    return players or {}
end

Actions['server:stash'] = function(data)
    if not data or type(data.name) ~= 'string' or data.name == '' then return false end
    CloseAdminPanel()
    TriggerServerEvent('inventory:server:OpenInventory', 'stash', data.name)
    TriggerEvent('inventory:client:SetCurrentStash', data.name)
    return true
end

Actions['economy:get'] = function(data)
    return lib.callback.await('qbx_admin:server:getEconomy', false, data and data.force) or false
end
