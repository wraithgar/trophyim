/*
    This program is distributed under the terms of the MIT license.
    Please see the LICENSE file for details.

    Copyright 2008 Michael Garvin
*/
var TROPHY_BOSH_SERVICE = '/proxy/xmpp-httpbind';  //Change to suit
var TROPHY_LOG_LINES = 200;
//TODO this should probably be a select element on the login page
var TROPHY_LOGLEVEL = 0; //0=debug, 1=info, 2=warn, 3=error, 4=fatal
var TROPHYIM_VERSION = 0.1;

/** File: trophyimclient.js
 *  A JavaScript front-end for strophe.js
 *
 *  This is a JavaScript library that runs on top of strophe.js.  All that
 *  is required is that your page have a <div> element with an id of
 *  'trophyimclient', and that your page does not explicitly set an onload
 *  event in its <body> tag.  In that case you need to append TrophyIM.load()
 *  to it.
 *
 *  The style of the client can be conrolled via trophyim.css, which is
 *  auto-included by the client.
 */ 

/** Class: HTMLSnippets
 *
 *  This is the repository for all the html snippets that TrophyIM uses
 *
 */
HTMLSnippets = {
    cssLink :
        "<link rel='stylesheet' href='trophyim.css' type='text/css'\
        media='screen' />",
    loginPage : "<div id='trophyimlogin'>\
        <form name='cred'><label for='trophyimjid'>JID:</label>\
        <input type='text' id='trophyimjid' /><br />\
        <label for='trophyimpass'>Password:</label>\
        <input type='password' id='trophyimpass' /><br />\
        <label for='trophyimlogging'>Logging</label>\
        <input type='checkbox' id='trophyimlogging' /><br />\
        <input type='button' id='trophyimconnect' value='connect'\
        onclick='TrophyIM.login()'/></form></div>",
    loggingDiv : "<div id='trophyimlog' />",
    rosterDiv : "<div id='trophyimroster' />",
    rosterGroup : "<div class='trophyimrostergroup'>\
        <div class='trophyimrosterlabel' /></div>",
    rosterItem : "<div class='trophyimrosteritem'\
        onclick='TrophyIM.rosterClick(this)'/>",
    statusDiv : "<div id='trophyimstatus'><span>Status:</span>\
        <span id='trophyimstatuslist'>Select box</span><br /><form>\
        <input type='button' value='disconnect' onclick='TrophyIM.logout()'/>\
        </form></div>",
    chatArea : "<div id='trophyimchat'><div id='trophyimchattabs' /></div>",
    chatBox : "<div><div class='trophyimchatbox' />\
        <form name='chat' onsubmit='TrophyIM.sendMessage(this); return(false);'>\
        <input type='text' class='trophyimchatinput' onsubmit='return(false);'/>\
        <input type='button' value='Send' onclick='TrophyIM.sendMessage(this)' />\
        </form></div>",
    chatTab :
        "<div class='trophyimchattab' onclick='TrophyIM.tabClick(this);' />"
};

/** Class: DOMObjects
 *  This class contains builders for all the DOM objects needed by TrophyIM
 */
DOMObjects = {
    /** Function: xmlParse
     *  Cross-browser alternative to using innerHTML
     *  Parses given string, returns valid DOM HTML object
     *
     *  Parameters:
     *    (String) xml - the xml string to parse
     */
    xmlParse : function(xmlString) {
        xmlObj = this.xmlRender(xmlString);
        if(xmlObj) {
            try { //Firefox, Gecko, etc
                if (this.processor == undefined) {
                    this.processor = new XSLTProcessor();
                    this.processor.importStylesheet(this.xmlRender(
                    '<xsl:stylesheet version="1.0"\
                    xmlns:xsl="http://www.w3.org/1999/XSL/Transform">\
                    <xsl:output method="html" indent="yes"/><xsl:template\
                    match="@*|node()"><xsl:copy><xsl:copy-of\
                    select="@*|node()"/></xsl:copy></xsl:template>\
                    </xsl:stylesheet>'));
                }
                htmlObj = this.processor.transformToDocument(xmlObj);
                return document.importNode(htmlObj.documentElement, true);
            } catch(e) {
                try { //IE
                    htmlObj = document.importNode(xmlObj.documentElement, true);
                    if(htmlObj.innerHTML) {
                        //this allegedly fixes events
                        htmlObj.innerHTML = htmlObj.innerHTML;
                    }
                    return htmlObj;
                } catch(e) {
                    alert(
                    "TrophyIM Error: Cannot add html to page" + e.message);
                }
            }
        }
    },
    /** Function: xmlRender
     *  Uses browser-specific methods to turn given string into xml object
     *
     *  Parameters:
     *    (String) xml - the xml string to parse
     */
    xmlRender : function(xmlString) {
        try {//IE
            renderObj = new ActiveXObject("Microsoft.XMLDOM");
            renderObj.async="false";
            if(xmlString) {
                renderObj.loadXML(xmlString);
            }
        } catch (e) {
            try { //Firefox, Gecko, etc
                if (this.parser == undefined) {
                    this.parser = new DOMParser();
                }
                renderObj = this.parser.parseFromString(xmlString,
                "application/xml");
            } catch(e) {
                alert("TrophyIM Error: Cannot create new html for page");
            }
        }

        return renderObj;
    },
    /** Function: getHTML
     *  Returns named HTML snippet as DOM object
     *
     *  Parameters:
     *    (String) name - name of HTML snippet to retrieve (see HTMLSnippets
     *    object)
     */
    getHTML : function(page) {
        return this.xmlParse(HTMLSnippets[page]);
    },
    /** Function: getScript
     *  Returns script object with src to given script
     *
     *  Parameters:
     *    (String) script - name of script to put in src attribute of script
     *    element
     */
    getScript : function(script) {
        newscript = document.createElement('script');
        newscript.setAttribute('src', script);
        newscript.setAttribute('type', 'text/javascript');
        newscript.onload = function() { TrophyIM.jsLoaded(script); }
        return newscript;
    }
};

/** Object: TrophyIM
 *
 *  This is the actual TrophyIM application.  It searches for the
 *  'trophyimclient' element and inserts itself into that.
 */
TrophyIM = {
    /** Object: activeChats
     *
     *  This object stores the currently active chats.
     */
    activeChats : {current: null, divs: {}},
    /** Function: jsLoaded
     *
     *  Called when a script that TrophyIM adds to the page is done loading,
     *  allowing TrophyIM to track what scripts have loaded.
     */
    jsLoaded : function(script) {
        TrophyIM.scripts_loaded[TrophyIM.scripts_loaded.length] = script;
    },
    /** Function: load
     * 
     *  This function searches for the trophyimclient div and loads the client
     *  into it.
     */
    load : function() {
        //TODO start using cookies to set up a session that remembers jid and
        //session from both
        client_div = document.getElementById('trophyimclient');
        if (client_div) {
            TrophyIM.scripts_loaded = new Array();
            TrophyIM.client_div = client_div
            //load .css
            document.getElementsByTagName('head')[0].appendChild(
            DOMObjects.getHTML('cssLink'));
            //Load other .js scripts needed
            document.getElementsByTagName('head')[0].appendChild(
            DOMObjects.getScript('strophejs/strophe.js'));
            document.getElementsByTagName('head')[0].appendChild(
            DOMObjects.getScript('strophejs/md5.js'));
            document.getElementsByTagName('head')[0].appendChild(
            DOMObjects.getScript('strophejs/sha1.js'));
            document.getElementsByTagName('head')[0].appendChild(
            DOMObjects.getScript('strophejs/b64.js'));
            //Wait half a second to give scripts time to load
            setTimeout("TrophyIM.showLogin()", 500);
        } else {
            alert("Cannot load TrophyIM client.\nClient div not found.");
        }
    },
    /**  Function: showlogin
     *
     *   This function clears out the IM box and redisplays the login page,
     *   preserving the logging div if it exists.
     */
    showLogin : function() {
        //TODO fix this so it works in IE again, IE doesn't fire onload for
        //<script> elements.
        //if(TrophyIM.scripts_loaded.length == 4) {
        if(TrophyIM.scripts_loaded.length == 4 ||
        document.getElementsByTagName('script').length == 5) {
            logging_div = TrophyIM.clearClient();
            TrophyIM.client_div.appendChild(DOMObjects.getHTML('loginPage'));
            if(logging_div) {
                TrophyIM.client_div.appendChild(logging_div);
                TrophyIM.logging_div =
                document.getElementById('trophyimlogging');
            }
        } else {
            //Call ourselves again in half a second to see if scripts are done
            //loading
            setTimeout("TrophyIM.showLogin()", 500);
        }
    },
    /** Function: log
     *
     *  This function logs the given message in the trophyimlog div
     *
     *  Parameter: (String) msg - the message to log
     */
    log : function(level, msg) {
        if (TrophyIM.logging_div && level >= TROPHY_LOGLEVEL) {
            while(TrophyIM.logging_div.childNodes.length > TROPHY_LOG_LINES) {
                TrophyIM.logging_div.removeChild(
                TrophyIM.logging_div.firstChild);
            }
            msg_div = document.createElement('div');
            msg_div.className = 'trophyimlogitem';
            msg_div.appendChild(document.createTextNode(msg));
            TrophyIM.logging_div.appendChild(msg_div);
        }
    },
    /** Function: rawInput
     *
     *  This logs the packets actually recieved by strophe at the debug level
     */
    rawInput : function (data) {
        TrophyIM.log(Strophe.LogLevel.DEBUG, "RECV: " + data);
    },
    /** Function: rawInput
     *
     *  This logs the packets actually recieved by strophe at the debug level
     */
    rawOutput : function (data) {
        TrophyIM.log(Strophe.LogLevel.DEBUG, "SEND: " + data);
    },
    /** Function: login
     *
     *  This function logs into server using information given on login page.
     *  Since the login page is where the logging checkbox is, it makes or
     *  removes the logging div accordingly.
     *
     */
    login : function() {
        if (document.getElementById('trophyimlogging').checked &&
        !document.getElementById('trophyimlog')) {
            TrophyIM.client_div.appendChild(DOMObjects.getHTML('loggingDiv'));
            TrophyIM.logging_div = document.getElementById('trophyimlog');
        } else if (document.getElementById('trophyimlog')) {
            TrophyIM.client_div.removeChild(document.getElementById(
            'trophyimlog'));
            TrophyIM.logging_div = null;
        }
        TrophyIM.connection = new Strophe.Connection(TROPHY_BOSH_SERVICE);
        TrophyIM.connection.rawInput = TrophyIM.rawInput;
        TrophyIM.connection.rawOutput = TrophyIM.rawOutput;
        Strophe.log = TrophyIM.log;
        //TODO user-specified option
        jid  = document.getElementById('trophyimjid').value + '/TrophyIM';
        password = document.getElementById('trophyimpass').value;
        button = document.getElementById('trophyimconnect');
        if (button.value == 'connect') {
            button.value = 'disconnect';
            TrophyIM.connection.connect(jid, password, TrophyIM.onConnect);
        } else {
            button.value = 'connect';
            TrophyIM.connection.disconnect();
        }

    },
    logout : function() {
        //TODO clear chats
        for (chat in TrophyIM.activeChats['divs']) {
            delete TrophyIM.activeChats['divs'][chat];
        }
        TrophyIM.activeChats = {current: null, divs: {}},
        TrophyIM.connection.disconnect();
        TrophyIM.showLogin();
    },
    onConnect : function(status) {
        if (status == Strophe.Status.CONNECTING) {
            TrophyIM.log(Strophe.LogLevel.INFO, 'Strophe is connecting.');
        } else if (status == Strophe.Status.CONNFAIL) {
            TrophyIM.log(Strophe.LogLevel.INFO, 'Strophe failed to connect.');
            document.getElementById('trophyimconnect').value='connect';
        } else if (status == Strophe.Status.DISCONNECTING) {
            TrophyIM.log(Strophe.LogLevel.INFO, 'Strophe is disconnecting.');
        } else if (status == Strophe.Status.DISCONNECTED) {
            TrophyIM.log(Strophe.LogLevel.INFO, 'Strophe is disconnected.');
            TrophyIM.showLogin();
        } else if (status == Strophe.Status.CONNECTED) {
            TrophyIM.log(Strophe.LogLevel.INFO, 'Strophe is connected.');
            TrophyIM.showClient();
        }
    },

    /** Function: showClient
     *
     *  This clears out the main div and puts in the main client.  It also
     *  registers all the handlers for Strophe to call in the client.
     */
    showClient : function() {
        logging_div = TrophyIM.clearClient();
        TrophyIM.client_div.appendChild(DOMObjects.getHTML('rosterDiv'));
        TrophyIM.client_div.appendChild(DOMObjects.getHTML('chatArea'));
        TrophyIM.client_div.appendChild(DOMObjects.getHTML('statusDiv'));
        if(logging_div) {
            TrophyIM.client_div.appendChild(logging_div);
            TrophyIM.logging_div = document.getElementById('trophyimlog');
        }
        TrophyIM.rosterObj = new TrophyIMRoster();
        TrophyIM.connection.addHandler(TrophyIM.onVersion, "jabber:iq:version",
        'iq', null, null, null);
        TrophyIM.connection.addHandler(TrophyIM.onRoster, Strophe.NS.ROSTER,
        'iq', null, null, null);
        TrophyIM.connection.addHandler(TrophyIM.onPresence, null, 'presence',
        null, null, null);
        TrophyIM.connection.addHandler(TrophyIM.onMessage, null, 'message',
        null, null,  null); 
        //Get roster then announce presence.
        TrophyIM.connection.send($iq({type: 'get', xmlns: Strophe.NS.CLIENT}).c(
        'query', {xmlns: Strophe.NS.ROSTER}).tree());
        //TODO make presence user-selectable?
        TrophyIM.connection.send($pres().tree());
        setTimeout("TrophyIM.renderRoster()", 1000);
    },
    /** Function: clearClient
     *
     *  Clears out client div, preserving and returning existing logging_div if
     *  one exists
     */
    clearClient : function() {
        //TODO this still appears to clobber existing logging elements
        if(TrophyIM.logging_div) {
            logging_div = TrophyIM.client_div.removeChild(
            document.getElementById('trophyimlog'));
        } else {
            logging_div = null;
        }
        while(TrophyIM.client_div.childNodes.length > 0) {
            TrophyIM.client_div.removeChild(TrophyIM.client_div.firstChild);
        }
        return logging_div;
    },
    /** Function: onVersion
     *
     *  Version iq handler
     */
    onVersion : function(msg) {
        TrophyIM.log(Strophe.LogLevel.DEBUG, "Version handler");
        type = msg.getAttribute('type');
        if (type == 'get') {
            from = msg.getAttribute('from');
            to = msg.getAttribute('to');
            id = msg.getAttribute('id');
            reply = $iq({type: 'result', to: from, from: to, id: id}).c('query',
            {name: "TrophyIM", version: TROPHYIM_VERSION, os:
            "Javascript-capable browser"});
            TrophyIM.connection.send(reply.tree());
        }
    },
    /** Function: onRoster
     *
     *  Roster iq handler
     */
    onRoster : function(msg) {
        TrophyIM.log(Strophe.LogLevel.DEBUG, "Roster handler");
        status = 'result';
        xmlroster = msg.firstChild;
        items = xmlroster.getElementsByTagName('item');
        for (i = 0; i < items.length; i++) {
            item = items[i];
            jid = item.getAttribute('jid'); //REQUIRED
            name = item.getAttribute('name'); //MAY
            subscription = item.getAttribute('subscription');
            groups = item.getElementsByTagName('group');
            group_array = new Array();
            for (g = 0; g < groups.length; g++) {
                group_array[group_array.length] =
                groups[g].firstChild.nodeValue;
            }
            TrophyIM.rosterObj.addContact(jid, subscription, name, group_array);
        }
        if (msg.getAttribute('type') == 'set') {
            TrophyIM.connection.send($iq({type: 'reply', id:
            msg.getAttribute('id'), to: msg.getAttribute('from')}));
        }
        return true;
    },
    /** Function: onPresence
     *
     *  Presence handler
     */
    onPresence : function(msg) {
        TrophyIM.log(Strophe.LogLevel.DEBUG, "Presence handler");
        type = msg.getAttribute('type') ? msg.getAttribute('type') :
        'available';
        show = msg.getElementsByTagName('show').length ? Strophe.getText(
        msg.getElementsByTagName('show')[0]) : type;
        from = msg.getAttribute('from');
        status = msg.getElementsByTagName('status').length ? Strophe.getText(
        msg.getElementsByTagName('status')[0]) : '';
        priority = msg.getElementsByTagName('priority').length ? parseInt(
        Strophe.getText(msg.getElementsByTagName('priority')[0])) : 0;
        TrophyIM.rosterObj.setPresence(from, priority, show, status);
        TrophyIM.log(Strophe.LogLevel.INFO, "Got presence " + from + " " +
        priority + " " + show + " " + status);
        //TODO auto-subscribe vs prompted subscribe based on config option
        return true;
    },
    /** Function: onMessage
     *
     *  Message handler
     */
     //TODO use xslt to turn <body> into <div id=trophyimchatmessage> and just
     //use that
    onMessage : function(msg) {
        TrophyIM.log(Strophe.LogLevel.DEBUG, "Message handler");
        to = msg.getAttribute('to');
        from = msg.getAttribute('from');
        type = msg.getAttribute('type');
        elems = msg.getElementsByTagName('body');

        if ((type == 'chat' || type == 'normal') && elems.length > 0) {
            body = elems[0]
            barejid = Strophe.getBareJidFromJid(from);
            contact = TrophyIM.rosterObj.roster[barejid]['contact'];
            if (contact) { //Do we know you?
                message  = contact['name'] + " (" + barejid + ")\n";
                message += Strophe.getText(body);
                TrophyIM.makeChat(from); //Make sure we have a chat window
                chat_box = TrophyIM.activeChats['divs'][barejid]['box']
                chat_box = chat_box.getElementsByClassName('trophyimchatbox');
                if(chat_box.length) {
                    msg_div = document.createElement('div');
                    msg_div.className = 'trophyimchatmessage';
                    msg_div.appendChild(document.createTextNode(message));
                    chat_box[0].appendChild(msg_div);
                }
                //TODO if not active, flag tab somehow
            }
        }
        return true;
    },
    /** Function: makeChat
     *
     *  Make sure chat window to given fulljid exists
     */
    makeChat : function(jid) {
        //TODO make sure resource is ok being empty for eventual offline chat
        barejid = Strophe.getBareJidFromJid(jid);
        if (!TrophyIM.activeChats['divs'][barejid]) {
            chat_area = document.getElementById('trophyimchat');
            chat_tabs = document.getElementById('trophyimchattabs');
            if (chat_area && chat_tabs) {
                chat_tab = DOMObjects.getHTML('chatTab');
                chat_tab.appendChild(document.createTextNode(barejid));
                chat_tab = chat_tabs.appendChild(chat_tab);
                chat_box = chat_area.appendChild(DOMObjects.getHTML('chatBox'))
                TrophyIM.activeChats['divs'][barejid] = {jid:jid, tab:chat_tab,
                box:chat_box};
            }
        }
        TrophyIM.activeChats['divs'][barejid]['resource'] =
        Strophe.getResourceFromJid(jid);
        if (!TrophyIM.activeChats['current']) { //We're the first
            chat_box = chat_area.appendChild(chat_box);
            TrophyIM.activeChats['divs'][barejid]['box'] = chat_box;
            TrophyIM.activeChats['current'] = barejid;
        }
    },
    /** Function showChat
     *
     *  Make chat box to given barejid active
     */
    showChat : function(jid) {
        if (TrophyIM.activeChats['current'] &&
        TrophyIM.activeChats['current'] != jid) {
            //TODO visually mark tab as active
            chat_area = document.getElementById('trophyimchat');
            active_box =
            chat_area.getElementsByClassName('trophyimchatbox')[0].parentNode;
            active_divs =
            TrophyIM.activeChats['divs'][TrophyIM.activeChats['current']];
            active_divs['box'] = chat_area.removeChild(active_box);
            TrophyIM.activeChats['divs'][jid]['box'] =
            chat_area.appendChild(TrophyIM.activeChats['divs'][jid]['box']);
            TrophyIM.activeChats['current'] = jid;
        }
    },
    /** Function: renderRoster
     *
     *  Renders roster, looking only for jids flagged by setPresence as having
     *  changed.
     */
    renderRoster : function() {
        if (TrophyIM.rosterObj.changes.length > 0) {
            roster_div = document.getElementById('trophyimroster');
            if(roster_div) {
                groups = new Array();
                for (var group in TrophyIM.rosterObj.groups) {
                    groups[groups.length] = group;
                }
                groups.sort();
                group_divs = roster_div.getElementsByClassName(
                'trophyimrostergroup');
                for (g = 0; g < group_divs.length; g++) {
                    group_div = group_divs[g];
                    group_name = group_div.getElementsByClassName(
                    'trophyimrosterlabel')[0].firstChild.nodeValue;
                    if (group_name > groups[0]) {
                        new_group = DOMObjects.getHTML('rosterGroup');
                        label_div = new_group.getElementsByClassName(
                        'trophyimrosterlabel')[0];
                        label_div.appendChild(document.createTextNode(
                        groups[0]));
                        new_group.appendChild(label_div);
                        new_group = roster_div.insertBefore(new_group,
                        group_div);
                        //Only update if we have changed jids in this group
                        for (i in TrophyIM.rosterObj.changes) {
                            if (TrophyIM.rosterObj.groups[groups[0]][
                            TrophyIM.rosterObj.changes[i]]) {
                                TrophyIM.renderGroup(new_group, groups[0],
                                TrophyIM.rosterObj.changes.slice());
                                break;
                            }
                        }
                    } else if (group_name == groups[0]) {
                        groups.shift();
                    }
                    //Only update if we have changed jids in this group
                    for (i in TrophyIM.rosterObj.changes) {
                        if (TrophyIM.rosterObj.groups[group_name][
                        TrophyIM.rosterObj.changes[i]]) {
                            TrophyIM.renderGroup(group_div, group_name,
                            TrophyIM.rosterObj.changes.slice());
                            break;
                        }
                    }
                }
                while (groups.length) {
                    new_group = DOMObjects.getHTML('rosterGroup');
                    group_name = groups.shift();
                    label_div = new_group.getElementsByClassName(
                    'trophyimrosterlabel')[0];
                    label_div.appendChild(document.createTextNode(group_name));
                    new_group.appendChild(label_div);
                    new_group = roster_div.appendChild(new_group);
                    //Only update if we have changed jids in this group
                    for (i in TrophyIM.rosterObj.changes) {
                        if (TrophyIM.rosterObj.groups[group_name][
                        TrophyIM.rosterObj.changes[i]]) {
                            TrophyIM.renderGroup(new_group, group_name,
                            TrophyIM.rosterObj.changes.slice());
                            break;
                        }
                    }
                }
            }
        }
        //Clear out changes
        TrophyIM.rosterObj.changes = new Array();
        setTimeout("TrophyIM.renderRoster()", 1000);
    },
    /** Function: renderGroup
     *
     *  Re-renders user entries in given group div based on status of roster
     *
     *  Parameter: (Array) changes - jids with changes in the roster.  Note:
     *  renderGroup will clobber this.
     */
    renderGroup : function(group_div, group_name, changes) {
        group_members = TrophyIM.rosterObj.groups[group_name];
        member_divs = group_div.getElementsByClassName('trophyimrosteritem');
        for (m = 0; m < member_divs.length; m++) {
            member_div = member_divs[m];
            member_jid = member_div.firstChild.nodeValue; //FIXME better layout
            changed_jid = changes[0];
            if (member_jid > changed_jid) {
                if (changed_jid in group_members) {
                    new_presence = TrophyIM.rosterObj.getPresence(changed_jid);
                    if(new_presence) {
                        //TODO show away status (trophyimrosteraway/available)
                        new_member = DOMObjects.getHTML('rosterItem');
                        new_member.appendChild(document.createTextNode(changed_jid));
                        group_div.insertBefore(new_member, member_div);
                    } else {
                        //TODO config item to show offline
                    }
                }
                changes.shift();
            } else if (member_jid == changed_jid) {
                member_presence = TrophyIM.rosterObj.getPresence(member_jid);
                if(member_presence) {
                    //TODO show away status (trophyimrosteraway/available)
                } else {
                    //TODO config item to show offline
                    group_div.removeChild(member_div);
                }
                changes.shift();
            }
        }
        while (changes.length > 0) {
            if (changes[0] in group_members) {
                new_presence = TrophyIM.rosterObj.getPresence(changes[0]);
                if(new_presence) {
                    //TODO show away status (trophyimrosteraway/available)
                    new_member = DOMObjects.getHTML('rosterItem');
                    new_member.appendChild(document.createTextNode(changes[0]));
                    group_div.appendChild(new_member);
                } else {
                    //TODO config item to show offline
                }
            }
            changes.shift();
        }
    },
    /** Function: rosterClick
     *
     *  Handles actions when a roster item is clicked
     */
    rosterClick : function(roster_item) {
        barejid = roster_item.firstChild.nodeValue;
        presence = TrophyIM.rosterObj.getPresence(barejid);
        if (presence && presence['resource']) {
            fulljid = barejid + "/" + presence['resource'];
        } else {
            fulljid = barejid;
        }
        TrophyIM.makeChat(fulljid);
        TrophyIM.showChat(barejid);
    },
    /** Function: tabClick
     *
     *  Handles actions when a chat tab is clicked
     */
    tabClick : function(tab_item) {
        barejid = tab_item.firstChild.nodeValue;
        TrophyIM.showChat(barejid);
    },
    /** Function: sendMessage
     *
     *  Send message from chat input to user
     */
    sendMessage : function(chat_box) {
        message_input =
        chat_box.parentNode.getElementsByClassName('trophyimchatinput')[0];
        message = message_input.value;
        active_jid = TrophyIM.activeChats['current'];
        if(active_jid) {
            active_chat = TrophyIM.activeChats['divs'][active_jid];
            to = active_jid;
            if (active_chat['resource']) {
                to += "/" + active_chat['resource'];
            }
            from = TrophyIM.connection.jid;
            msg = $msg({to: to, from: from, type: 'chat'}).c('body').t(message);
            TrophyIM.connection.send(msg.tree());
            msg_div = document.createElement('div');
            msg_div.className = 'trophyimchatmessage';
            msg_div.appendChild(document.createTextNode("Me:\n" + message));
            active_chat['box'].getElementsByClassName(
            'trophyimchatbox')[0].appendChild(msg_div);
        }
        message_input.value = '';
    }
};

/** Class: TrophyIMRoster
 *
 *
 *  This object stores the roster and presence info for the TrohyIMClient
 *
 */
function TrophyIMRoster() { 
    /** Constants: internal arrays
     *    (Object) roster - the actual roster/presence information
     *    (Object) groups - list of current groups in the roster
     *    (Array) changes - array of jids with presence changes, whatever
     *    watches the roster should clear these as it handles them.
     */
    this.roster = {};
    this.groups = {};
    this.changes = new Array();
    /** Function: addContact
     *
     *  Adds given contact to roster
     *
     *  Parameters:
     *    (String) jid - bare jid
     *    (String) subscription - subscription attribute for contact
     *    (String) name - name attribute for contact
     *    (Array) groups - array of groups contact is member of
     */
    this.addContact = function(jid, subscription, name, groups) {
        contact = {jid:jid, subscription:subscription, name:name, groups:groups}
        if (this.roster[jid]) {
            this.roster[jid]['contact'] = contact;
        } else {
            this.roster[jid] = {contact:contact};
        }
        if (groups) { //Add to all listed groups
            for (g = 0; g < groups.length; g++) {
                if (!this.groups[groups[g]]) {
                    this.groups[groups[g]] = {};
                }
                this.groups[groups[g]][jid] = jid;
            }
        } else { //Add to empty name group
            if (!this.groups['']) {
                this.groups[''] = {};
            }
            this.groups[''][jid] = jid;
        }
    }
    /** Function: getContact
     *
     *  Returns contact entry for given jid
     *
     *  Parameter: (String) jid - jid to return
     */
    this.getContact = function(jid) {
        roster_entry = this.roster[jid];
        if (roster_entry) {
            return roster_entry['contact'];
        }
    }
    /** Function: setPresence
     *
     *  Sets presence
     *
     *  Parameters:
     *    (String) fulljid: full jid with presence
     *    (Integer) priority: priority attribute from presence
     *    (String) show: show attribute from presence
     *    (String) status: status attribute from presence
     */
    this.setPresence = function(fulljid, priority, show, status) {
        resource = Strophe.getResourceFromJid(fulljid);
        jid = Strophe.getBareJidFromJid(fulljid);
        //TODO figure out what to do about own presence from other resources if
        //we're not in our own roster
        if(show != 'unavailable') {
            if (!this.roster[jid]) {
                this.addContact(jid, 'not-in-roster');
            }
            presence = {
                resource:resource, priority:priority, show:show, status:status
            }
            if (!this.roster[jid]['presence']) {
                this.roster[jid]['presence'] = {}
            }
            this.roster[jid]['presence'][resource] = presence
        } else if (this.roster[jid] && this.roster[jid]['presence'] &&
        this.roster[jid]['presence'][resource]) {
            delete this.roster[jid]['presence'][resource];
        }
        //TODO this is ugly
        found = false;
        for (x in this.changes) {
            if (this.changes[x] == jid) {
                found = true;
                break;
            }
        }
        if (!found) {
            this.changes[this.changes.length] = jid;
        }
        this.changes.sort();
    }
    /** Function: getPresence
     *
     *  Returns best presence for given jid as Array(resource, priority, show,
     *  status)
     *
     *  Parameter: (String) fulljid - jid to return best presence for
     */
    this.getPresence = function(fulljid) {
        jid = Strophe.getBareJidFromJid(fulljid);
        current = null;
        if (this.roster[jid] && this.roster[jid]['presence']) {
            for (var resource in this.roster[jid]['presence']) {
                presence = this.roster[jid]['presence'][resource];
                if (current == null) {
                    current = presence
                } else {
                    if(presence['priority'] > current['priority'] && ((presence['show'] == "chat"
                    || presence['show'] == "available") || (current['show'] != "chat" ||
                    current['show'] != "available"))) {
                        current = presence
                    }
                }
            }
        }
        return current;
    }
}
/** Constants: Node types
 *
 * Implementations of constants that IE doesn't have, but we need.
 */
if (document.ELEMENT_NODE == null) {
    document.ELEMENT_NODE = 1;
    document.ATTRIBUTE_NODE = 2;
    document.TEXT_NODE = 3;
    document.CDATA_SECTION_NODE = 4;
    document.ENTITY_REFERENCE_NODE = 5;
    document.ENTITY_NODE = 6;
    document.PROCESSING_INSTRUCTION_NODE = 7;
    document.COMMENT_NODE = 8;
    document.DOCUMENT_NODE = 9;
    document.DOCUMENT_TYPE_NODE = 10;
    document.DOCUMENT_FRAGMENT_NODE = 11;
    document.NOTATION_NODE = 12;
}

/** Function: importNode
 *
 *  document.importNode implementation for IE, which doesn't have importNode
 *
 *  Parameters:
 *    (Object) node - dom object
 *    (Boolean) allChildren - import node's children too
 */
if (!document.importNode) {
    document.importNode = function(node, allChildren) {
        switch (node.nodeType) {
            case document.ELEMENT_NODE:
                var newNode = document.createElement(node.nodeName);
                if (node.attributes && node.attributes.length > 0) {
                    for(var i = 0; i < node.attributes.length; i++) {
                        newNode.setAttribute(node.attributes[i].nodeName,
                        node.getAttribute(node.attributes[i].nodeName));
                    }
                }
                if (allChildren && node.childNodes &&
                node.childNodes.length > 0) {
                    for (var i = 0; i < node.childNodes.length; i++) {
                        newNode.appendChild(document.importNode(
                        node.childNodes[i], allChildren));
                    }
                }
                return newNode;
                break;
            case document.TEXT_NODE:
            case document.CDATA_SECTION_NODE:
            case document.COMMENT_NODE:
                return document.createTextNode(node.nodeValue);
                break;
        }
    };
}

/**
 *
 * Bootstrap self into window.onload
 */
oldonload = window.onload;
window.onload = function() {
    if(oldonload) {
        oldonload();
    }
    TrophyIM.load();
};