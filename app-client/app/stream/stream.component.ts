import { Component } from '@angular/core';
import {VgAPI} from 'videogular2/core';

@Component({
    selector: 'app-stream',
    templateUrl: './stream.component.html',
    styleUrls: ['./stream.component.css'],
    inputs: ['source']
})
export class StreamComponent{
    constructor() {

    }
}
