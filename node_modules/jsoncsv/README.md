# JSONCSV

Standard for compressed JSON data, inspired by CSV.


The most common format for REST clients to use to transmit data is JSON. It's human-readable, human-editable, and has implementations in multiple languages. The problem is it's rather verbose, especially in the fact you have to re-specify the keys for each object, even if they're the same. This doesnt make much difference for small datasets, but for larger datasets of the same object type, or where download time is a factor, data that doesnt need to be sent multiple times, shouldnt. That's where JSONCSV comes in.

Borrowing from a CSV concept, JSONCSV only requires the field names in full once. After that, fields just need to be in the same order as the fields to be the same order as the keys were defined. As it's all valid JSON, no extra steps are required to recieve the data, besides a client that will accept JSON. The only change will be to add a parser that will make the JSONCSV easier to interact with.

### Example Structure
```json
{
  "rows": [
    [1, "Jake", 19, true],
    [2, "Howard", 16, true]
  ],
  "columns": [
    "id", "name", "age", "is_nerd"
  ]
}

```
