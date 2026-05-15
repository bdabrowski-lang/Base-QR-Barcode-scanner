# BASE – QR&Barcode scanner

Chrome extension do skanowania kodów kreskowych i QR bezpośrednio na stronach internetowych.

## Instalacja

1. [Pobierz ZIP](../../raw/main/extension.zip) i rozpakuj
2. Otwórz `chrome://extensions`
3. Włącz **Tryb dewelopera**
4. Kliknij **Załaduj rozpakowane** → wskaż folder `extension/`

## Funkcje

| Funkcja | Opis |
|---|---|
| 🔴 Laser poziomy / pionowy | Linia podąża za kursorem, `R` zmienia orientację |
| ⊞ Tryb QR | Ramka 240×240 px, wykrywa QR, Data Matrix, Aztec, PDF417 i inne |
| 📋 Schowek | Zeskanowana wartość kopiowana automatycznie |
| 🔊 Dźwięk | Sygnał po skanie, wyciszenie przez `M` lub przycisk |
| 💾 Pamięć | Tryb, orientacja i wyciszenie zapamiętane w localStorage |

## Skróty klawiszowe

| Klawisz | Akcja |
|---|---|
| `Klik LPM` | Skanuj |
| `Q` | Kod kreskowy ↔ QR |
| `R` | Orientacja poziomo ↔ pionowo (tylko tryb kod kreskowy) |
| `M` | Wycisz / włącz dźwięk |
| `ESC` | Zamknij skaner |
