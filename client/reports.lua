Actions = Actions or {}

local function result(ok, data)
    if ok then return data == nil and true or data end
    return { error = data and locale(data) or locale('ui.err_generic') }
end

Actions['reports:list'] = function()
    return lib.callback.await('qbx_admin:server:getReports', false) or {}
end

Actions['reports:send'] = function(data)
    return result(lib.callback.await('qbx_admin:server:sendReportMessage', false, data.id, data.text))
end

Actions['reports:action'] = function(data)
    return result(lib.callback.await('qbx_admin:server:reportAction', false, data.id, data.action))
end

Actions['reports:dm'] = function(data)
    return result(lib.callback.await('qbx_admin:server:startDM', false, data.id, data.text))
end

Actions['my:list'] = function()
    return lib.callback.await('qbx_admin:server:getMyReports', false) or {}
end

Actions['my:create'] = function(data)
    return result(lib.callback.await('qbx_admin:server:createReport', false, data))
end

Actions['my:send'] = function(data)
    return result(lib.callback.await('qbx_admin:server:sendReportMessage', false, data.id, data.text))
end

Actions['my:close'] = function(data)
    return result(lib.callback.await('qbx_admin:server:reportAction', false, data.id, 'close'))
end

Actions['my:rate'] = function(data)
    return result(lib.callback.await('qbx_admin:server:rateReport', false, data.id, data.stars))
end

local lastTyping = 0
Actions['typing'] = function(data)
    local now = GetGameTimer()
    if now - lastTyping < 1500 then return true end
    lastTyping = now
    TriggerServerEvent('qbx_admin:server:reportTyping', data.id)
    return true
end

RegisterNetEvent('qbx_admin:client:reportSync', function(report, meta, asStaff)
    SendNUIMessage({ action = 'reportSync', report = report, meta = meta, asStaff = asStaff })
end)

RegisterNetEvent('qbx_admin:client:reportRemoved', function(id)
    SendNUIMessage({ action = 'reportRemoved', id = id })
end)

RegisterNetEvent('qbx_admin:client:reportTyping', function(id, name)
    SendNUIMessage({ action = 'reportTyping', id = id, name = name })
end)

RegisterNetEvent('qbx_admin:client:openReports', function()
    OpenReportWindow()
end)
