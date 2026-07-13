# Import dosare oferte clienti

Pune aici dosarele organizate pe clienti. Numele fiecarui folder va fi folosit ca nume client in Nexora.

Exemplu:

```text
utile/import-oferte-clienti/
  SIGMALUX SRL/
    Oferta_ERP.pdf
    Anexa_2.docx
    Raspuns_clarificari.pdf
  TD ADVISORY INVEST SRL/
    Oferta.pdf
```

Fisiere acceptate:

- PDF
- DOC / DOCX
- XLS / XLSX

Verificare fara import real:

```bash
node scripts/import-client-offer-folders.mjs --source utile/import-oferte-clienti
```

Import real in Nexora -> Vanzari -> Oferte importate:

```bash
node scripts/import-client-offer-folders.mjs --source utile/import-oferte-clienti --commit
```

Observatii:

- Daca un client exista deja cu acelasi nume, documentele se leaga de clientul existent.
- Daca nu exista, scriptul creeaza clientul automat cu un cod intern de tip `DOSAR-...`.
- Scriptul copiaza fisierele in `uploads/sales/offers/company-1/`; nu muta si nu sterge fisierele originale.
- Daca rulezi importul de doua ori, documentele deja importate sunt sarite ca duplicate.
