'use strict';

(function(){

  var module = angular.module('mapstorySearch', [], function($locationProvider) {
      if (window.navigator.userAgent.indexOf("MSIE") == -1){
        $locationProvider.html5Mode({
          enabled: true,
          requireBase: false
        });
        // make sure that angular doesn't intercept the page links
        angular.element("a").prop("target", "_self");
      }
    });

  module.directive('ngEnter', function () {
    return function (scope, element, attrs) {
      element.bind("keydown keypress", function (event) {
        if(event.which === 13) {
          scope.$apply(function (){
            scope.$eval(attrs.ngEnter);
          });
          event.preventDefault();
        }
      });
    };
  });

  module.service('elasticSearch', elasticSearch); 

  function elasticSearch(Configs) {

    var get_url = function() {
      return Configs.url;
    };

    return {
      get_url: get_url,
    };
  }

  /*
  * Main search controller
  * Load data from api and defines the multiple and single choice handlers
  * Syncs the browser url with the selections
  */
  module.controller('searchController', function($injector, $scope, $location, $http, $q, Configs, Django, elasticSearch){

    //console.log(elasticSearch.get_url());

    //load site categories
    $http.get(CATEGORIES_ENDPOINT, {})
      .success(function(data){ 
        $scope.categories = data.objects;
    })

    //load keywords and establish a very simple trending count
    $scope.trending = [];
    $http.get(KEYWORDS_ENDPOINT, {}).success(function(data){ 
      $scope.keywords = data.objects
      //poor choice in sorting
      var results = data.objects.sort(function(kw1, kw2) {
        return kw2.count - kw1.count;
      });
      // Grab the top 8 // or change the # displaying here
      var num_trending = (results.length > 8) ? 8 : results.length;
      for (var i = 0; i < num_trending; i++) {
        if (results[i].count > 0) {
          $scope.trending.push(results[i]);
        }
      }
    })
 
    $scope.query = $location.search();
    
    if (!Configs.hasOwnProperty("disableQuerySync")) {
      // Keep in sync the page location with the query object
      $scope.$watch('query', function(){
        $location.search($scope.query);
      }, true);
    } 

    /* Persisting content and storyteller view & queries through page refresh */
    
    if ($scope.query.storyteller){
      //storyteller explore
      $scope.apiEndpoint = '/api/owners/';
    } else {
      //default to content explore
      $scope.apiEndpoint = '/api/base/search/';
      $scope.query.content = true;
      $scope.query.is_published = true;
    }

    $scope.query.limit = $scope.query.limit || CLIENT_RESULTS_LIMIT;
    $scope.query.offset = $scope.query.offset || 0;

    // Make the content one active, user inactive
    $scope.toUserSearch = function() {
      $scope.apiEndpoint = '/api/owners/';
      $scope.query = { storyteller: true, limit: CLIENT_RESULTS_LIMIT, offset: 0 };
      $scope.search();
    };
    // Make the user one active, content inactive
    $scope.toContentSearch = function() {
      $scope.apiEndpoint = '/api/base/search/';
      $scope.query = { content: true, is_published: true, limit: CLIENT_RESULTS_LIMIT, offset: 0 };
      $scope.search();
    };


    $scope.django = Django.all();


    $scope.search = function() {
      return query_api($scope.query).then(function(result) {
        return result;
      });
    };

    //Get data from apis and make them available to the page
    function query_api(data){

      return $http.get($scope.apiEndpoint, {params: data || {}}).success(function(data){
        $scope.results = data.objects;
        $scope.total_counts = data.meta.total_count;
        $scope.$root.query_data = data;
        if (HAYSTACK_SEARCH) {
          if ($location.search().hasOwnProperty('q')){
            $scope.text_query = $location.search()['q'].replace(/\W+/g," ");
          }
          if ($location.search().hasOwnProperty('type__in')){
            // TODO Apr 27 2016: Take into account multiple values for 'type__in'
            //$scope.type__in = $location.search()['type__in'].replace(/\W+/g," ");
          }
        } else {
          if ($location.search().hasOwnProperty('title__icontains')){
            $scope.text_query = $location.search()['title__icontains'].replace(/\W+/g," ");
          }
        }
      });
    };

    /*
    * ADD TYPE MAPSTORY OR LAYER
    */
    $scope.contentType = function(type) {
      $scope.query['type__in'] = type;
      query_api($scope.query);
    }

    /*
    * Toggle adding/removing this filter
    */
    $scope.toggle_query = function(toggle, filter, value) {
      if (toggle) {
        add_query(filter, value);
      } else {
        remove_query(filter, value);
      }
    }

    
    /*
    * Add the selection behavior to the element, it adds/removes the 'active' class
    * and pushes/removes the value of the element from the query object
    */
    $scope.multiple_choice_listener = function($event){
      var element = $($event.target);
      var query_entry = [];
      var data_filter = element.attr('data-filter');
      var value = element.attr('data-value');

      // If the query object has the record then grab it
      if ($scope.query.hasOwnProperty(data_filter)){

        // When in the location are passed two filters of the same
        // type then they are put in an array otherwise is a single string
        if ($scope.query[data_filter] instanceof Array){
          query_entry = $scope.query[data_filter];
        }else{
          query_entry.push($scope.query[data_filter]);
        }
      }

      // If the element is active active then deactivate it
      if(element.hasClass('active')){
        // clear the active class from it
        element.removeClass('active');

        // Remove the entry from the correct query in scope
        query_entry.splice(query_entry.indexOf(value), 1);
      }
      // if is not active then activate it
      else if(!element.hasClass('active')){
        // Add the entry in the correct query
        if (query_entry.indexOf(value) == -1){
          query_entry.push(value);
        }
        element.addClass('active');
      }

      //save back the new query entry to the scope query
      $scope.query[data_filter] = query_entry;

      //if the entry is empty then delete the property from the query
      if(query_entry.length == 0){
        delete($scope.query[data_filter]);
      }
      query_api($scope.query);
    }









    /*
    * Pagination 
    */

    $scope.page = Math.round(($scope.query.offset / $scope.query.limit) + 1);
    $scope.numpages = Math.round(($scope.total_counts / $scope.query.limit) + 0.49);

    // Control what happens when the total results change
    $scope.$watch('total_counts', function(){
      $scope.numpages = Math.round(
        ($scope.total_counts / $scope.query.limit) + 0.49
      );

      // In case the user is viewing a page > 1 and a 
      // subsequent query returns less pages, then 
      // reset the page to one and search again.
      if($scope.numpages < $scope.page){
        $scope.page = 1;
        $scope.query.offset = 0;
        query_api($scope.query);
      }

      // In case of no results, the number of pages is one.
      if($scope.numpages == 0){$scope.numpages = 1};
    });

    $scope.paginate_down = function(){
      if($scope.page > 1){
        $scope.page -= 1;
        $scope.query.offset =  $scope.query.limit * ($scope.page - 1);
        query_api($scope.query);
      }   
    }

    $scope.paginate_up = function(){
      if($scope.numpages > $scope.page){
        $scope.page += 1;
        $scope.query.offset = $scope.query.limit * ($scope.page - 1);
        query_api($scope.query);
      }
    }



    /* functionality for tagging and queries */     
    function add_query(filter, value) {
      var query_entry = [];
      if ($scope.query.hasOwnProperty(filter)) {
        //if theres a list of items, grab them. otherwise, add the only value to empty list
        if ($scope.query[filter] instanceof Array) {
          query_entry = $scope.query[filter];
        } else {
          query_entry.push($scope.query[filter]);
        }
        // Only add it if this value doesn't already exist
        // Apparently this doesn't exactly work...
        if ($scope.query[filter].indexOf(value) == -1) {
          query_entry.push(value);
        }
      } else {
        query_entry = [value];
      }
      $scope.query[filter] = query_entry;
      query_api($scope.query);
    };

    $scope.add_search = function(filter, value, array) {
      if (array.indexOf(value) == -1) {
        array.push(value);
        add_query(filter, value);
      }
    }

    function remove_query(filter, value) {
      var query_entry = [];
      // First check if this even exists to remove
      if ($scope.query.hasOwnProperty(filter)) {
        // Grab the current query
        if ($scope.query[filter] instanceof Array) {
          query_entry = $scope.query[filter];
        } else {
          query_entry.push($scope.query[filter]);
        }
        // Remove this value
        query_entry.splice(query_entry.indexOf(value), 1);
        // Update and run the query
        $scope.query[filter] = query_entry;
        query_api($scope.query);
      }
    };

    $scope.remove_search = function(filter, value, array) {
      var index = array.indexOf(value);
      if (index != -1) {
        array.splice(index, 1);
        remove_query(filter, value);
      }
    }

    // Configure new autocomplete
    var profile_autocompletes = [];
    var region_autocompletes = [];
    var keyword_autocompletes = [];
    var city_autocompletes = [];


    var usernames = [];
    var regions = [];
    var keywords = [];
    var cities = [];
    var countries = [];
    // This will contain the country code, i.e. Canada's code is CAN, at the same index location
    // as region_autocompletes stores the country name.
    var country_codes = [];

    function init_tokenfields() {
      var deferred = $q.defer();
      var promises = [];
      promises.push(
        profile_autocomplete()
        .then(function() {
          $('#tokenfield-profile')
            .tokenfield({
              autocomplete: {
                source: profile_autocompletes,
                delay: 100,
                minLength: 3
              },
              showAutocompleteOnFocus: true,
              limit: 10
            })
            .on('tokenfield:createdtoken', function(e) {
               $scope.add_search('owner__username__in', e.attrs.value, usernames);
            })
            .on('tokenfield:removedtoken', function(e) {
              $scope.remove_search('owner__username__in', e.attrs.value, usernames);
            });

          $('#tokenfield-city')
            .tokenfield({
              autocomplete: {
                source: city_autocompletes
              },
              limit: 10
            })
            .on('tokenfield:createdtoken', function(e) {
              $scope.add_search('city', e.attrs.value, cities);
            })
            .on('tokenfield:removedtoken', function(e) {
              $scope.remove_search('city', e.attrs.value, cities);
            });
        })
      );

      promises.push(
        keyword_autocomplete()
        .then(function() {
          $('#tokenfield-keyword')
          .tokenfield({
            autocomplete: {
              source: keyword_autocompletes,
              delay: 100,
              minLength: 3
            },
            showAutocompleteOnFocus: true,
            limit: 10
          })
          .on('tokenfield:createtoken', function(e) {
            // Tokenize by space if num_spaces > 3
            var num_spaces = (e.attrs.value.match(/ /g)||[]).length;
            var data = e.attrs.value.split(' ');
            if (num_spaces > 3) {
              e.attrs.value = data[0];
              e.attrs.label = data[0];
              for (var i = 1; i < data.length; i++) {
                $('#tokenfield-keyword').tokenfield('createToken', data[i]);
              }
            }
          })
          .on('tokenfield:createdtoken', function(e) {
            $scope.add_search('keywords__slug__in', e.attrs.value, keywords);
          })
          .on('tokenfield:removedtoken', function(e) {
            $scope.remove_search('keywords__slug__in', e.attrs.value, keywords);
          });
        })
      );

      $q.all(promises)
        .then(function() {
          deferred.resolve();
        }, function() {
          deferred.reject('Some tokenization field initializations failed');
        }
      );
      return deferred.promise;
    }

    function profile_autocomplete() {
      return $http.get('/api/owners/')
        .success(function(data){
          var results = data.objects;
          // Here we have first name, last name, and username
          // append them all together to be used in the profile autocomplete
          for (var i = 0; i < results.length; i++) {
            profile_autocompletes.push(results[i].first_name);
            profile_autocompletes.push(results[i].last_name);
            profile_autocompletes.push(results[i].username);
            if (results[i].city != null) {
              city_autocompletes.push(results[i].city);
            }
          }
        });
    };

    function keyword_autocomplete() {
      return $http.get('/api/keywords/')
        .success(function(data){
          var results = data.objects;
          for (var i = 0; i < results.length; i++) {
            keyword_autocompletes.push(results[i].slug);
          }
        });
    };

    init_tokenfields()

    $scope.filterVTC = function() {
      // When VTC check box is clicked, also filter by VTC; when unchecked, reset it
      if ($scope.VTCisChecked == true) {
        $scope.itemFilter['Volunteer_Technical_Community'] = true;
      } else {
        $scope.itemFilter = { is_active: true };
      }
    };
    $scope.filterVTC();

    $scope.feature_select = function($event){
      var element = $($event.target);
      var article = $(element.parents('article')[0]);
      if (article.hasClass('resource_selected')){
        element.html('Select');
        article.removeClass('resource_selected');
      }
      else{
        element.html('Deselect');
        article.addClass('resource_selected');
      } 
    };

    // Set the default orderMethod for when a user first hits the Explore page to be descending views.
    $scope.orderMethod = '-popular_count';
    // Allow the user to choose an order method using the What's Hot section.
    $scope.orderMethodUpdate = function(orderMethod) {
      $scope.orderMethod = orderMethod;
    };

    $scope.search();
  });

  // add filter to decode uri
  module.filter('decodeURIComponent', function() {
    return window.decodeURIComponent;
  });
  
})();