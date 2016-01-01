
VERSION = "0.01 1Jan16"
//API = "http://gmd.pagekite.me/api/v1/scores/?format=json";
API = "/api/v1/";


viewModel = {


    // a class has many slots
    // an arena has many classes
    arena_list: new Array(),
    class_list : new Array(),
    slot_list : new Array(),

    class_map: new Array(),   // map class id to class item in class_list

    load_data: function() {
        // check to see if data needs updating

        var that = this;

        this.clear_localstorage()   // tempo just for the moment

        // try local data first, if not found load data from server, put into local storage and then
        // call load_from_localstorage.  This in turn will call page_init
        if (!this.load_from_localstorage()) {
            this.load_from_server();

        }


    },
    load_from_localstorage: function() {
        var that = this;


        var alist = simpleStorage.get("ARENA_DATA");

        // assume if no arena data then nothing in storage
        if (typeof alist == "undefined") {
            return false
        } else {
            this.arena_list = alist;
        }

        this.class_list = simpleStorage.get("CLASS_DATA");
        this.slot_list = simpleStorage.get("SLOT_DATA");

        //// create assoc arrays
        //$.each(that.arena_list, function() {
        //    that.arenas[this.id] = this;
        //});
        //
        //$.each(that.class_list, function() {
        //    that.classes[this.id] = this;
        //});
        //
        //$.each(that.slot_list, function() {
        //    that.slots[this.id] = this;
        //});


        this.recalculate();

        return true;

    },

    load_from_server: function() {
        //queue()
        //    .defer(this.load_from_server_tests())
        //    .defer(this.load_from_server_classes())
        //
        //    .awaitAll(page_init());
        // going to run sync for the moment calling one from within the other - should queue


        var that = this;

        this.arena_list.push({'id': 1, 'name': 'Arena 1', start: moment().hour(9).minute(0)});
        this.arena_list.push({'id': 2, 'name': 'Arena 2', start: moment().hour(9).minute(0)});

        simpleStorage.set("ARENA_DATA", that.arena_list);


        d3.csv("classes.csv")
            .row(function (d, i) {
                var data = d;

                // ensure there is a start object, doesn't matter what the new value is
                if (typeof data['start'] == "undefined") {
                    data.start = moment();
                    data.start_time = "";  // time as text
                }
                // will hold the total time, including breaks
                data.total_duration = 0;
                return data;
            })
            .get(function (error, rows) {

                var class_rows = rows;
                simpleStorage.set("CLASS_DATA", class_rows);

                // create map so as to make it quick to retrieve class data
                $.each(class_rows, function(i, d) {
                    that.class_map[d.classid] = i;
                });

                // Load entries
                d3.csv("data.csv")
                    .row(function (d, i) {
                        var data = d;

                        // ensure there is a start object, doesn't matter what the new value is
                        if (!$.inArray("start", data)) {
                            data.start = moment();
                            data.start_time = "";  // time as text
                        }

                        // get slot duration from class
                        data.duration = parseFloat(class_rows[data.classid].test_duration);

                        return data;
                    })
                    .get(function (error, rows) {


                        // group entries by class
                        var data_by_class = d3.nest()
                            .key(function (d) {
                                return d.classid;
                            })
                            .map(rows);



                        // now save slot data
                        simpleStorage.set("SLOT_DATA", data_by_class);
                        that.load_from_localstorage();
                        that.draw();

                    });
            });
    },

    clear_localstorage: function() {

        simpleStorage.deleteKey("ARENA_DATA");
        simpleStorage.deleteKey("CLASS_DATA");
        simpleStorage.deleteKey("SLOT_DATA");
    },

    get_slot_data: function(classid) {
        var data = this.slot_list[parseInt(classid)];
        if (typeof data == "undefined") {
            return [];
        } else {
            return data;
        }
    },
    get_class_data: function(classid) {
        var i =  this.class_map[classid];
        return this.class_list[i];
    },
    get_class_duration: function(classid) {

        var data = this.slot_list[classid];

        if (typeof data != "undefined") {
            var duration = d3.nest()
                .key(function (d) {
                    return d.classid;
                })
                .rollup(function (leaves) {
                    return d3.sum(leaves, function (d) {
                        return d.duration;
                    })
                })
                .map(data);


            return duration[classid];
        } else {
            return 0;
        }

    },
    get_class_start: function(classid) {

        var that = this;
        var start = arena_start;

        // get end of previous class or break in this arena
        var previous = false;
        $.each(that.class_list, function (i, d) {
            if (d.classid == classid) {
                if (previous) {
                    start = previous.end;
                    return false;   // to exit each
                }
            }

            previous = d;
        });

        return start;


    },

    recalculate: function() {
        // TODO: don't need to recalculate everything

        var that = this;


        // update class_data with start and end times
        // TODO: assumes 1 arena
        $.each(this.class_list, function (i, d) {

            d.total_duration = that.get_class_duration(d.classid);
            d.start = that.get_class_start(d.classid);
            d.end = moment(d.start).add(d.total_duration, 'minutes');

        });


        //don't put this call in the previous loop as lost access to updated start and end times
        $.each(this.class_list, function (i, d) {

            // having got the start time for the class, recalculate all the slot times
            that.recalculate_class_slots(d.classid);

        });


    },

    recalculate_class_slots: function(classid) {

        var that = this;
        var slot_data = this.get_slot_data(classid);


        var starts = moment(this.get_class_data(classid).start);

        $.each(slot_data, function (i, d) {
            d.start = moment(starts);
            d.end = moment(d.start).add(d.duration, 'minutes');

            starts = moment(d.end);
        });

    },

    draw: function() {

        var that = this;
        this.draw_classes();
        $.each(this.class_list, function () {
            that.draw_slots(this);
        });

        // make them sortable
        that.add_sortables();
    },

    draw_classes: function() {

        var classes = d3.select("#arena1");

        // create a list of classes
        classes.selectAll("li")
            .data(this.class_list)
            .enter().append("li")
            .attr("class", "competition")
            .html(this.make_class);

    },

    draw_slots: function(class_data) {

        var that = this;
        var slots = d3.select("#class" + class_data.classid);
        var slot_data = this.get_slot_data(class_data.classid);

        slots.selectAll("li")
            .data(slot_data)
            .enter().append("li")
            .attr("class", "slot")
            .html(function (d, i) {
                return that.make_slot(d, i);
            });


    },


    make_class: function(d, i) {
        if (typeof d != "undefined") {
            d.start_time = moment(d.start).format("H:mm");
        }
        return class_template(d);
    },

    make_slot: function(d, i) {
        var this_class = this.get_class_data(d.classid)

        d.start_time = moment(d.start).format("H:mm");
        return slot_template(d);
    },

    add_sortables: function() {

        $('.arena').sortable({
            forcePlaceholderSize: true,
            placeholderClass: 'border border-orange mb1'
        });

        $('.slots').sortable({
            forcePlaceholderSize: true,
            placeholderClass: 'border border-maroon mb1'
        });

        $('.slots').sortable().bind('sortupdate', function (e, ui) {

            var moved_data = ui.item[0].__data__;

            var slots = d3.select("#class" + moved_data.classid);

            slots.selectAll("li")
                .html(function (d, i) {
                    return viewModel.make_slot(d, i);
                });

            slots.selectAll("li")
                //.filter(function (d) {
                //    return d.rider === moved_data.rider;
                //})
                .classed("pop", function (d, i) {

                    return d.rider === moved_data.rider;
                });

        })
    }

}

function init() {

    viewModel.load_data();

    get_current_settings();


    $("#version").html(VERSION);

    return viewModel;

}


function save_current_settings() {
// save currently selected test to local storage
    simpleStorage.set("settings", JSON.stringify({
        test_id: viewModel.current_test.id

    }));


}

function get_current_settings() {
// get last used test from local storage

    //// if none exists, create a demo one
    if (simpleStorage.get("settings") == undefined) {
        save_initial_settings();
    }
    //
    //// now try to load
    //
    //
    var setting = JSON.parse(simpleStorage.get("settings"));
    //
    //viewModel.current_event = setting.event;
    //viewModel.current_test.id = setting.test_id;
    //viewModel.current_test.name = setting.test_name;
    //viewModel.current_test.potential = setting.potential;
    //viewModel.current_test.times2 = setting.times2;
    //viewModel.current_test.collectives = setting.collectives;
    //viewModel.current_test.num_scores = viewModel.num_scores();
    //viewModel.current_class = setting.current_class;
    //
    //SOUND['end'] = setting.sound_end;
    //SOUND['button'] = setting.sound_button;
    //
    //recalc();
    //

}


function save_initial_settings() {
    // first time used or if error loading previous test
    simpleStorage.set("settings", JSON.stringify({
        test_id: "demo"

    }));

}

/* example data

 classid,name,test,test_duration
 1, Medium - DI M67, M67, 7
 2, Novice Category 1 - DI N27, N27, 6
 3, Pony Rider - FEI Team Test, FEITT, 6
 5, Novice Category 1, N27, 6

 */




