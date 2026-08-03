# Índice de Casos de Uso - Chatbot Asador Casa Julián

Este directorio contiene la documentación técnica y funcional detallada paso a paso de todos los **Casos de Uso** contemplados en el chatbot de WhatsApp de **Asador Casa Julián**.

---

## 📚 Listado de Casos de Uso

| Nº | Documento | Descripción Breve |
|---|---|---|
| 01 | [Caso_de_Uso_01_Saludo_Inicial_y_Seleccion_de_Restaurante.md](./Caso_de_Uso_01_Saludo_Inicial_y_Seleccion_de_Restaurante.md) | Bienvenida inicial y selección de Tolosa / Madrid con memoria persistente. |
| 02 | [Caso_de_Uso_02_Hacer_Reserva_Web_Sin_Tarjeta.md](./Caso_de_Uso_02_Hacer_Reserva_Web_Sin_Tarjeta.md) | Derivación a la web oficial para reservas estándar sin tarjeta regalo. |
| 03 | [Caso_de_Uso_03_Reserva_con_Tarjeta_de_Regalo.md](./Caso_de_Uso_03_Reserva_con_Tarjeta_de_Regalo.md) | Flujo completo de reserva directa mediante código de Tarjeta Regalo (Menú Tradición). |
| 04 | [Caso_de_Uso_04_Inscripcion_en_Lista_de_Espera.md](./Caso_de_Uso_04_Inscripcion_en_Lista_de_Espera.md) | Formulario de 6 pasos para inscripciones confirmadas en lista de espera y control anti-duplicados. |
| 05 | [Caso_de_Uso_05_Peticion_de_Modificacion_de_Reserva.md](./Caso_de_Uso_05_Peticion_de_Modificacion_de_Reserva.md) | Verificación progresiva por Nombre+Teléfono y modificación de comensales, fecha u hora. |
| 06 | [Caso_de_Uso_06_Peticion_de_Cancelacion_de_Reserva.md](./Caso_de_Uso_06_Peticion_de_Cancelacion_de_Reserva.md) | Verificación por Nombre+Teléfono, política de <24h y cancelación de reserva. |
| 07 | [Caso_de_Uso_07_Regalar_Menu_Tradicion_Online.md](./Caso_de_Uso_07_Regalar_Menu_Tradicion_Online.md) | Información y enlace web para regalar tarjetas del Menú Tradición. |
| 08 | [Caso_de_Uso_08_Otras_Cuestiones_FAQ_y_Contacto.md](./Caso_de_Uso_08_Otras_Cuestiones_FAQ_y_Contacto.md) | Submenú informativo de horarios, preguntas frecuentes y teléfono directo de recepción. |
| 09 | [Caso_de_Uso_09_Cambiar_Idioma.md](./Caso_de_Uso_09_Cambiar_Idioma.md) | Cambio de idioma interactivo entre los 14 idiomas soportados. |

---

## 🛠️ Tecnologías y Estructura
- **Bot Engine:** Node.js, Baileys / WhatsApp Web API.
- **Base de Datos:** PostgreSQL (Neon) + Backup Local JSON (`db.json`).
- **Idiomas:** 14 Idiomas con internacionalización centralizada (`i18n.js`).
