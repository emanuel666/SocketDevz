# Modo compartido para chat y VPS

Este proyecto ya no depende solo de `localStorage`. Ahora puede funcionar con un servidor compartido para que el chat y la lista de VPS se vean desde cualquier dispositivo.

## Cómo usarlo

1. Ejecuta el servidor con `npm start` o `node server.js`.
2. Abre `http://localhost:3000` en el navegador.
3. Para que otras personas vean los mismos datos, despliega este mismo proyecto en un VPS o hosting público.

## Lo que necesitas darme si quieres dejarlo listo en producción

- La URL pública donde vas a alojar el proyecto.
- Si quieres proteger eliminaciones, un valor para `ADMIN_TOKEN`.
- Si prefieres otro puerto o dominio, también lo puedo ajustar.

## Variables opcionales

- `PORT`: puerto del servidor.
- `HOST`: host de escucha. Por defecto usa `0.0.0.0`.
- `ADMIN_TOKEN`: token requerido para borrar VPS cuando está configurado.

## Qué hace el servidor

- Sirve los archivos HTML, CSS y JS.
- Expone `/api/chat` y `/api/vps` como almacenamiento compartido.
- Borra automáticamente el chat cuando cambia el día en hora Colombia.
- Elimina los VPS vencidos al leer o guardar datos.
