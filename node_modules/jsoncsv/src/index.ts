
export interface JSONCSVData {
  rows: Array<Array<any>>,
  columns: string[]
}


export class JSONCSV {
  private _data: JSONCSVData

  constructor(data: JSONCSVData) {
    this._data = data;
  }

  getColumnNames() : Array<string> {
    return this._data.columns;
  }

  get(field: string, index: number) : any {
    const fieldIndex = this._data.columns.indexOf(field);
    return this._data.rows[index][fieldIndex];
  }

  toObject(index: number): Object {
    let obj = {}
    this._data.columns.forEach((columnName, columnIndex) => {
      obj[columnName] = this.get(columnName, index);
    })
    return obj;
  }

  allToObjects(): Array<Object> {
    let objects = [];
    this._data.rows.forEach((row, index) => {
      objects.push(
        this.toObject(index)
      );
    });
    return objects;
  }
}
