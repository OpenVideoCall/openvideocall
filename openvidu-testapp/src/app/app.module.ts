import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FlexLayoutModule } from '@angular/flex-layout';
import { AppMaterialModule } from './app.material.module';

import { routing } from './app.routing';
import { AppComponent } from './app.component';
import { TestSessionsComponent } from './components/test-sessions/test-sessions.component';
import { TestApirestComponent } from './components/test-apirest/test-apirest.component';
import { OpenviduInstanceComponent } from './components/openvidu-instance/openvidu-instance.component';
import { ExtensionDialogComponent } from './components/openvidu-instance/extension-dialog.component';
import { LocalRecordingDialogComponent } from './components/test-sessions/local-recording-dialog.component';

import { OpenviduRestService } from './services/openvidu-rest.service';
import { OpenviduParamsService } from './services/openvidu-params.service';
import { TestFeedService } from './services/test-feed.service';
import { MuteSubscribersService } from './services/mute-subscribers.service';

@NgModule({
  declarations: [
    AppComponent,
    OpenviduInstanceComponent,
    TestSessionsComponent,
    TestApirestComponent,
    ExtensionDialogComponent,
    LocalRecordingDialogComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    BrowserAnimationsModule,
    AppMaterialModule,
    FlexLayoutModule,
    routing
  ],
  providers: [
    OpenviduRestService,
    OpenviduParamsService,
    TestFeedService,
    MuteSubscribersService
  ],
  entryComponents: [
    ExtensionDialogComponent,
    LocalRecordingDialogComponent
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
